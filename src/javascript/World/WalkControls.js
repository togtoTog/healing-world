import * as THREE from 'three'

/**
 * WalkControls - 步行控制器
 * WASD/方向键步行移动
 * 鼠标 Pointer Lock 控制朝向
 * 移动端：左侧虚拟摇杆移动，右侧滑动转向
 * 简单 AABB 碰撞检测
 */
export default class WalkControls
{
    constructor(_options)
    {
        this.time     = _options.time
        this.sizes    = _options.sizes
        this.renderer = _options.renderer
        this.config   = _options.config
        this.camera   = _options.camera   // THREE.PerspectiveCamera 实例

        // 玩家位置（Z-up 坐标系）
        this.position = new THREE.Vector3(0, -5, 1.7)

        // 朝向角度（绕 Z 轴 yaw，绕本地 X 轴 pitch）
        this.yaw   = 0
        this.pitch = 0
        this.pitchMin = -Math.PI * 0.35
        this.pitchMax =  Math.PI * 0.35

        // 移动速度（单位/帧）
        this.speed      = 0.06
        this.sprintSpeed = 0.12

        // 鼠标灵敏度
        this.mouseSensitivity = 0.002
        this.touchSensitivity = 0.003

        // 按键状态
        this.keys = {
            forward:  false,
            backward: false,
            left:     false,
            right:    false,
            sprint:   false,
        }

        // 碰撞体（AABB，由外部添加）
        this.colliders = []

        // 摇杆状态
        this._joystickActive = false
        this._joystickDelta = { x: 0, y: 0 }
        this._joystickTouchId = null
        this._lookDelta = { x: 0, y: 0 }
        this._lookTouchId = null
        this._lookLastPos = { x: 0, y: 0 }

        // 是否已锁定指针
        this._pointerLocked = false

        this._setupKeyboard()
        this._setupPointerLock()
        this._setupTouchControls()
        this._setupTick()
    }

    /** 添加 AABB 碰撞体 { min: Vector3, max: Vector3 } */
    addCollider(aabb)
    {
        this.colliders.push(aabb)
    }

    // ─────────────────────────────────────────────
    // 内部方法
    // ─────────────────────────────────────────────

    _setupKeyboard()
    {
        const keyMap = {
            'KeyW': 'forward',  'ArrowUp': 'forward',
            'KeyS': 'backward', 'ArrowDown': 'backward',
            'KeyA': 'left',     'ArrowLeft': 'left',
            'KeyD': 'right',    'ArrowRight': 'right',
            'ShiftLeft': 'sprint', 'ShiftRight': 'sprint',
        }

        window.addEventListener('keydown', (e) =>
        {
            const action = keyMap[e.code]
            if(action) this.keys[action] = true
        })

        window.addEventListener('keyup', (e) =>
        {
            const action = keyMap[e.code]
            if(action) this.keys[action] = false
        })
    }

    _setupPointerLock()
    {
        // 点击 canvas 请求鼠标锁定（非移动端）
        this.renderer.domElement.addEventListener('click', () =>
        {
            if(!this.config.touch && !this._pointerLocked)
            {
                this.renderer.domElement.requestPointerLock()
            }
        })

        document.addEventListener('pointerlockchange', () =>
        {
            this._pointerLocked = document.pointerLockElement === this.renderer.domElement
        })

        document.addEventListener('mousemove', (e) =>
        {
            if(!this._pointerLocked) return

            this.yaw   -= e.movementX * this.mouseSensitivity
            this.pitch -= e.movementY * this.mouseSensitivity
            this.pitch  = Math.max(this.pitchMin, Math.min(this.pitchMax, this.pitch))
        })
    }

    _setupTouchControls()
    {
        // 创建左侧虚拟摇杆
        this._createJoystick()

        const canvas = this.renderer.domElement

        canvas.addEventListener('touchstart', (e) =>
        {
            Array.from(e.changedTouches).forEach(touch =>
            {
                const x = touch.clientX
                const halfW = this.sizes.viewport.width / 2

                if(x < halfW)
                {
                    // 左侧 → 摇杆
                    if(this._joystickTouchId === null)
                    {
                        this._joystickTouchId = touch.identifier
                        this._joystickOrigin = { x: touch.clientX, y: touch.clientY }
                        this._joystickActive = true
                        this._updateJoystickUI(0, 0)
                    }
                }
                else
                {
                    // 右侧 → 转向
                    if(this._lookTouchId === null)
                    {
                        this._lookTouchId = touch.identifier
                        this._lookLastPos = { x: touch.clientX, y: touch.clientY }
                    }
                }
            })
        }, { passive: true })

        canvas.addEventListener('touchmove', (e) =>
        {
            Array.from(e.changedTouches).forEach(touch =>
            {
                if(touch.identifier === this._joystickTouchId)
                {
                    const dx = touch.clientX - this._joystickOrigin.x
                    const dy = touch.clientY - this._joystickOrigin.y
                    const maxR = 40
                    const dist = Math.min(Math.sqrt(dx * dx + dy * dy), maxR)
                    const angle = Math.atan2(dy, dx)
                    this._joystickDelta.x = Math.cos(angle) * (dist / maxR)
                    this._joystickDelta.y = Math.sin(angle) * (dist / maxR)
                    this._updateJoystickUI(this._joystickDelta.x * maxR, this._joystickDelta.y * maxR)
                }

                if(touch.identifier === this._lookTouchId)
                {
                    const dx = touch.clientX - this._lookLastPos.x
                    const dy = touch.clientY - this._lookLastPos.y
                    this.yaw   -= dx * this.touchSensitivity
                    this.pitch -= dy * this.touchSensitivity
                    this.pitch  = Math.max(this.pitchMin, Math.min(this.pitchMax, this.pitch))
                    this._lookLastPos = { x: touch.clientX, y: touch.clientY }
                }
            })
        }, { passive: true })

        canvas.addEventListener('touchend', (e) =>
        {
            Array.from(e.changedTouches).forEach(touch =>
            {
                if(touch.identifier === this._joystickTouchId)
                {
                    this._joystickTouchId = null
                    this._joystickActive = false
                    this._joystickDelta = { x: 0, y: 0 }
                    this._updateJoystickUI(0, 0)
                }
                if(touch.identifier === this._lookTouchId)
                {
                    this._lookTouchId = null
                }
            })
        }, { passive: true })
    }

    _createJoystick()
    {
        // 只在移动端显示
        const base = document.createElement('div')
        base.id = 'joystick-base'
        Object.assign(base.style, {
            position:     'fixed',
            bottom:       '80px',
            left:         '60px',
            width:        '80px',
            height:       '80px',
            borderRadius: '50%',
            border:       '2px solid rgba(255,255,255,0.4)',
            background:   'rgba(0,0,0,0.25)',
            display:      'none',
            alignItems:   'center',
            justifyContent: 'center',
            zIndex:       '500',
            pointerEvents: 'none',
            backdropFilter: 'blur(4px)',
        })

        const stick = document.createElement('div')
        stick.id = 'joystick-stick'
        Object.assign(stick.style, {
            width:        '36px',
            height:       '36px',
            borderRadius: '50%',
            background:   'rgba(255,255,255,0.6)',
            position:     'absolute',
            transition:   'transform 0.05s ease',
        })

        base.appendChild(stick)
        document.body.appendChild(base)

        this._joystickBase  = base
        this._joystickStick = stick

        // 触摸一次后显示
        window.addEventListener('touchstart', () =>
        {
            base.style.display = 'flex'
        }, { once: true })
    }

    _updateJoystickUI(dx, dy)
    {
        if(this._joystickStick)
        {
            this._joystickStick.style.transform = `translate(${dx}px, ${dy}px)`
        }
    }

    _setupTick()
    {
        this.time.on('tick', () =>
        {
            this._updateMovement()
            this._updateCamera()
        })
    }

    _updateMovement()
    {
        const spd = this.keys.sprint ? this.sprintSpeed : this.speed

        // 计算移动方向（基于 yaw）
        let moveX = 0  // left/right in world
        let moveY = 0  // forward/back in world

        // 键盘
        if(this.keys.forward)  moveY += 1
        if(this.keys.backward) moveY -= 1
        if(this.keys.left)     moveX -= 1
        if(this.keys.right)    moveX += 1

        // 触摸摇杆（Y轴在屏幕中向下为正，前进应为负 dy）
        if(this._joystickActive)
        {
            moveX += this._joystickDelta.x
            moveY -= this._joystickDelta.y
        }

        if(moveX === 0 && moveY === 0) return

        // 归一化斜向移动
        const len = Math.sqrt(moveX * moveX + moveY * moveY)
        if(len > 1)
        {
            moveX /= len
            moveY /= len
        }

        // Z-up 坐标系：朝向为 -Y 方向旋转 yaw 后的向量
        // yaw 绕 Z 轴，forward = (sin(yaw), -cos(yaw), 0) → 但需要-Y作前进
        // 实际上：玩家前方向量（水平面）= (-sin(yaw), cos(yaw), 0) ... 视yaw定义
        // 我们的 yaw: 初始=0 → 朝 +Y 方向
        const cosY = Math.cos(this.yaw)
        const sinY = Math.sin(this.yaw)

        // forward 单位向量（水平面内）
        const fwdX = -sinY
        const fwdY =  cosY
        // right = forward 向量顺时针旋转90°
        const rgtX =  cosY
        const rgtY =  sinY

        const dx = (fwdX * moveY + rgtX * moveX) * spd
        const dy = (fwdY * moveY + rgtY * moveX) * spd

        const newPos = this.position.clone()
        newPos.x += dx
        newPos.y += dy

        // 碰撞检测
        if(!this._checkCollision(newPos))
        {
            this.position.copy(newPos)
        }
        else
        {
            // 分轴测试
            const newPosX = this.position.clone()
            newPosX.x += dx
            if(!this._checkCollision(newPosX)) this.position.x = newPosX.x

            const newPosY = this.position.clone()
            newPosY.y += dy
            if(!this._checkCollision(newPosY)) this.position.y = newPosY.y
        }
    }

    _checkCollision(pos)
    {
        const radius = 0.4  // 玩家碰撞半径
        for(const aabb of this.colliders)
        {
            if(
                pos.x + radius > aabb.min.x &&
                pos.x - radius < aabb.max.x &&
                pos.y + radius > aabb.min.y &&
                pos.y - radius < aabb.max.y
            )
            {
                return true  // 碰撞
            }
        }
        return false
    }

    _updateCamera()
    {
        if(!this.camera) return

        // 更新摄像机位置（Z-up：高度固定在 position.z）
        this.camera.position.set(
            this.position.x,
            this.position.y,
            this.position.z
        )

        // 构建朝向四元数（Z-up 坐标系）
        // yaw 绕 Z 轴，pitch 绕本地 X 轴
        const qZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.yaw)
        const qX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.pitch)
        const q  = new THREE.Quaternion().multiplyQuaternions(qZ, qX)
        this.camera.quaternion.copy(q)
    }
}

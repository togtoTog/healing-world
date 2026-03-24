import * as THREE from 'three'
import gsap from 'gsap'

/**
 * FirstPersonCamera
 * 
 * 在原有第三人称摄像机基础上，新增第一人称视角。
 * 通过 toggle() 方法或按 V 键在两种视角之间平滑切换。
 * 
 * 第一人称模式：
 *   - 摄像机贴附在小车驾驶舱位置
 *   - 鼠标移动控制视角朝向（Pointer Lock API）
 *   - 移动端：陀螺仪 + 触摸滑动控制视角
 */
export default class FirstPersonCamera
{
    constructor(_options)
    {
        this.time        = _options.time
        this.sizes       = _options.sizes
        this.renderer    = _options.renderer
        this.camera      = _options.camera   // 原 Camera 实例
        this.config      = _options.config

        // FPS 专属摄像机实例（独立于第三人称）
        this.instance = new THREE.PerspectiveCamera(
            75,
            this.sizes.viewport.width / this.sizes.viewport.height,
            0.1,
            200
        )
        this.instance.up.set(0, 0, 1)

        // 眼睛相对于车体中心的偏移（Z-up 坐标系）
        // X=左右, Y=前后（正值=车头方向）, Z=上下
        // 往前推到挡风玻璃处，稍微抬高视点
        this.eyeOffset = new THREE.Vector3(0, 0.8, 1.4)

        // 视角旋转（水平 yaw，垂直 pitch）
        this.yaw   = 0
        this.pitch = 0
        this.pitchMin = -Math.PI * 0.35
        this.pitchMax =  Math.PI * 0.35

        // 鼠标灵敏度
        this.mouseSensitivity = 0.002
        this.touchSensitivity = 0.004

        // 当前是否处于第一人称
        this.active = false

        // 是否正在过渡（防止快速切换）
        this.transitioning = false

        // 触摸上一帧位置
        this._lastTouchX = 0
        this._lastTouchY = 0

        this._setupResizeListener()
        this._setupKeyboardToggle()
        this._setupPointerLock()
        this._setupTouchLook()
        this._setupTickUpdate()
        this._createUI()
    }

    // ─────────────────────────────────────────────
    // 公开方法
    // ─────────────────────────────────────────────

    /** 切换第一/第三人称 */
    toggle()
    {
        if(this.transitioning) return
        this.active ? this.deactivate() : this.activate()
    }

    /** 进入第一人称 */
    activate()
    {
        if(this.active || this.transitioning) return
        this.transitioning = true
        this.active = true

        // 如果不是移动端，请求指针锁定
        if(!this.config.touch)
        {
            this.renderer.domElement.requestPointerLock()
        }

        this._updateButtonUI()

        // 延迟解除过渡锁，给动画留时间
        setTimeout(() => { this.transitioning = false }, 600)
    }

    /** 退出第一人称 */
    deactivate()
    {
        if(!this.active || this.transitioning) return
        this.transitioning = true
        this.active = false

        if(document.pointerLockElement === this.renderer.domElement)
        {
            document.exitPointerLock()
        }

        this._updateButtonUI()
        setTimeout(() => { this.transitioning = false }, 600)
    }

    /**
     * 每帧由 Application 调用，同步摄像机到小车位置。
     * @param {THREE.Vector3} carPosition - 小车世界坐标
     * @param {THREE.Quaternion} carQuaternion - 小车世界四元数
     */
    update(carPosition, carQuaternion)
    {
        if(!this.active) return

        // 眼睛位置 = 小车位置 + 车身局部偏移转世界
        const eyeWorld = this.eyeOffset.clone().applyQuaternion(carQuaternion).add(carPosition)
        this.instance.position.copy(eyeWorld)

        // 以车身朝向为基准，再叠加鼠标 yaw/pitch
        // 车身 yaw（绕 Z 轴，因场景 Z-up）
        const carEuler = new THREE.Euler().setFromQuaternion(carQuaternion, 'ZYX')
        const totalYaw = carEuler.z + this.yaw

        const q = new THREE.Quaternion()
        // 先绕 Z 轴 yaw
        const qZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), totalYaw)
        // 再绕本地 X 轴 pitch（俯仰）
        const qX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.pitch)
        q.multiplyQuaternions(qZ, qX)

        this.instance.quaternion.copy(q)
        this.instance.updateMatrixWorld()
    }

    // ─────────────────────────────────────────────
    // 内部初始化
    // ─────────────────────────────────────────────

    _setupResizeListener()
    {
        this.sizes.on('resize', () =>
        {
            this.instance.aspect = this.sizes.viewport.width / this.sizes.viewport.height
            this.instance.updateProjectionMatrix()
        })
    }

    _setupKeyboardToggle()
    {
        window.addEventListener('keydown', (e) =>
        {
            if(e.key === 'v' || e.key === 'V')
            {
                this.toggle()
            }
        })
    }

    _setupPointerLock()
    {
        // 指针锁定后监听鼠标移动
        document.addEventListener('mousemove', (e) =>
        {
            if(!this.active) return
            if(document.pointerLockElement !== this.renderer.domElement) return

            this.yaw   -= e.movementX * this.mouseSensitivity
            this.pitch -= e.movementY * this.mouseSensitivity
            this.pitch  = Math.max(this.pitchMin, Math.min(this.pitchMax, this.pitch))
        })

        // 指针锁失去时自动退出第一人称
        document.addEventListener('pointerlockchange', () =>
        {
            if(document.pointerLockElement !== this.renderer.domElement && this.active)
            {
                this.deactivate()
            }
        })

        // 点击 canvas 时重新请求锁定（第一人称下）
        this.renderer.domElement.addEventListener('click', () =>
        {
            if(this.active && !this.config.touch)
            {
                this.renderer.domElement.requestPointerLock()
            }
        })
    }

    _setupTouchLook()
    {
        // 移动端：双指以外的单指滑动控制视角（单指移动已被 Car Controls 用于驾驶，这里用双指）
        // 实际上 Controls.js 用单指驾驶，双指缩放；我们在第一人称下改为单指看，双指仍保留缩放
        this.renderer.domElement.addEventListener('touchstart', (e) =>
        {
            if(!this.active) return
            if(e.touches.length === 1)
            {
                this._lastTouchX = e.touches[0].clientX
                this._lastTouchY = e.touches[0].clientY
            }
        }, { passive: true })

        this.renderer.domElement.addEventListener('touchmove', (e) =>
        {
            if(!this.active) return
            if(e.touches.length === 1)
            {
                const dx = e.touches[0].clientX - this._lastTouchX
                const dy = e.touches[0].clientY - this._lastTouchY

                this.yaw   -= dx * this.touchSensitivity
                this.pitch -= dy * this.touchSensitivity
                this.pitch  = Math.max(this.pitchMin, Math.min(this.pitchMax, this.pitch))

                this._lastTouchX = e.touches[0].clientX
                this._lastTouchY = e.touches[0].clientY
            }
        }, { passive: true })
    }

    _setupTickUpdate()
    {
        // tick 由 Application 统一调用 update()，这里不重复绑定
    }

    // ─────────────────────────────────────────────
    // UI 按钮
    // ─────────────────────────────────────────────

    _createUI()
    {
        // 创建切换按钮，悬浮在画面右下角
        this._btn = document.createElement('button')
        this._btn.id = 'fps-toggle-btn'
        this._btn.title = '切换视角 (V)'
        this._btn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
            </svg>
        `

        Object.assign(this._btn.style, {
            position:       'fixed',
            bottom:         '24px',
            right:          '24px',
            zIndex:         '1000',
            width:          '44px',
            height:         '44px',
            borderRadius:   '50%',
            border:         '2px solid rgba(255,255,255,0.4)',
            background:     'rgba(0,0,0,0.5)',
            color:          '#fff',
            cursor:         'pointer',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            backdropFilter: 'blur(8px)',
            transition:     'all 0.3s ease',
            outline:        'none',
        })

        this._btn.addEventListener('mouseenter', () =>
        {
            this._btn.style.background = 'rgba(255,255,255,0.15)'
        })
        this._btn.addEventListener('mouseleave', () =>
        {
            this._btn.style.background = this.active
                ? 'rgba(100,200,255,0.3)'
                : 'rgba(0,0,0,0.5)'
        })
        this._btn.addEventListener('click', () => this.toggle())

        document.body.appendChild(this._btn)

        // ESC 提示（第一人称下显示）
        this._hint = document.createElement('div')
        this._hint.id = 'fps-hint'
        this._hint.innerHTML = '按 <kbd>V</kbd> 或点右下角按钮 退出第一人称 &nbsp;|&nbsp; <kbd>ESC</kbd> 解除鼠标锁定'
        Object.assign(this._hint.style, {
            position:       'fixed',
            top:            '16px',
            left:           '50%',
            transform:      'translateX(-50%)',
            zIndex:         '1000',
            padding:        '8px 16px',
            borderRadius:   '8px',
            background:     'rgba(0,0,0,0.6)',
            color:          'rgba(255,255,255,0.85)',
            fontSize:       '13px',
            backdropFilter: 'blur(8px)',
            opacity:        '0',
            transition:     'opacity 0.4s ease',
            pointerEvents:  'none',
            whiteSpace:     'nowrap',
        })
        this._hint.querySelectorAll && null  // 不操作子元素
        document.body.appendChild(this._hint)
    }

    _updateButtonUI()
    {
        if(this.active)
        {
            this._btn.style.background     = 'rgba(100,200,255,0.3)'
            this._btn.style.borderColor    = 'rgba(100,200,255,0.8)'
            this._hint.style.opacity       = '1'
        }
        else
        {
            this._btn.style.background     = 'rgba(0,0,0,0.5)'
            this._btn.style.borderColor    = 'rgba(255,255,255,0.4)'
            this._hint.style.opacity       = '0'
        }
    }
}

import * as THREE from 'three'

/**
 * PlayerCharacter - 玩家角色（低多边形人形）
 * 
 * 用基础几何体拼出一个可爱的低多边形小人：
 *   头部（圆球）+ 身体（圆柱）+ 四肢（圆柱）
 * 
 * 第三人称时可见，第一人称时隐藏。
 * 相机跟随逻辑也在这里处理。
 */
export default class PlayerCharacter
{
    constructor(_options)
    {
        this.scene    = _options.scene
        this.time     = _options.time
        this.sizes    = _options.sizes
        this.renderer = _options.renderer
        this.passes   = _options.passes

        // 当前视角模式: 'third' | 'first'
        this.mode = 'third'

        // 角色在世界中的位置与朝向（由 WalkControls 驱动）
        this.position    = new THREE.Vector3(0, -5, 0)
        this.facingAngle = 0  // 绕 Z 轴的 yaw 角

        // 第三人称摄像机偏移（相对角色）
        this.thirdPersonOffset = new THREE.Vector3(0, -4, 3)  // 后方+上方
        this.thirdPersonLookAtOffset = new THREE.Vector3(0, 0, 1.5)  // 看向角色头部

        // 第三人称摄像机实例
        this.thirdCamera = new THREE.PerspectiveCamera(
            60,
            this.sizes.viewport.width / this.sizes.viewport.height,
            0.1,
            300
        )
        this.thirdCamera.up.set(0, 0, 1)

        // 第一人称摄像机（步行时眼睛位置）
        this.firstCamera = new THREE.PerspectiveCamera(
            75,
            this.sizes.viewport.width / this.sizes.viewport.height,
            0.1,
            300
        )
        this.firstCamera.up.set(0, 0, 1)

        // 当前激活摄像机
        this.activeCamera = this.thirdCamera

        // 第三人称相机当前 yaw/pitch（鼠标绕角色旋转）
        this._camYaw   = Math.PI   // 初始在角色后方
        this._camPitch = 0.4       // 稍微俯视
        this._camDist  = 5         // 距离角色的距离
        this._camPitchMin = 0.1
        this._camPitchMax = Math.PI * 0.45

        // 第一人称 yaw/pitch
        this._fpYaw   = 0
        this._fpPitch = 0
        this._fpPitchMin = -Math.PI * 0.4
        this._fpPitchMax =  Math.PI * 0.4

        // 鼠标灵敏度
        this._mouseSens = 0.003
        this._pointerLocked = false

        // 走路动画计时
        this._walkCycle = 0
        this._isMoving  = false

        this._buildCharacter()
        this._setupResizeListener()
        this._setupPointerLock()
        this._setupVKeyToggle()
        this._setupTickUpdate()
        this._buildUI()
    }

    // ─────────────────────────────────────────────
    // 构建小人模型
    // ─────────────────────────────────────────────

    _buildCharacter()
    {
        this.group = new THREE.Group()
        this.scene.add(this.group)

        const skinColor    = 0xFFD6B0
        const clothColor   = 0x7BA7BC   // 蓝色上衣
        const pantsColor   = 0x4A6741   // 绿色裤子
        const hairColor    = 0x2C1810   // 深棕发色
        const shoeColor    = 0x3D2B1F   // 深棕鞋

        const matSkin  = new THREE.MeshToonMaterial({ color: skinColor })
        const matCloth = new THREE.MeshToonMaterial({ color: clothColor })
        const matPants = new THREE.MeshToonMaterial({ color: pantsColor })
        const matHair  = new THREE.MeshToonMaterial({ color: hairColor })
        const matShoe  = new THREE.MeshToonMaterial({ color: shoeColor })

        // Z-up 坐标系，角色直立方向 = Z 轴
        // 底部脚在 Z=0，顶部头顶在 Z≈2.0

        // ── 头部 ──
        const headGeo  = new THREE.SphereGeometry(0.22, 8, 8)
        this._head     = new THREE.Mesh(headGeo, matSkin)
        this._head.position.set(0, 0, 1.72)
        this.group.add(this._head)

        // 刘海
        const hairGeo  = new THREE.SphereGeometry(0.23, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55)
        this._hair     = new THREE.Mesh(hairGeo, matHair)
        this._hair.position.set(0, 0, 1.72)
        this.group.add(this._hair)

        // 眼睛（小黑球）
        const eyeGeo = new THREE.SphereGeometry(0.04, 6, 6)
        const matEye = new THREE.MeshToonMaterial({ color: 0x1A1A1A })
        const eyeL   = new THREE.Mesh(eyeGeo, matEye)
        const eyeR   = new THREE.Mesh(eyeGeo, matEye)
        eyeL.position.set( 0.09, -0.18, 1.76)
        eyeR.position.set(-0.09, -0.18, 1.76)
        this.group.add(eyeL, eyeR)

        // ── 身体 ──
        const bodyGeo  = new THREE.CylinderGeometry(0.18, 0.20, 0.60, 8)
        this._body     = new THREE.Mesh(bodyGeo, matCloth)
        // CylinderGeometry 默认 Y-up，旋转到 Z-up
        this._body.rotation.x = Math.PI / 2
        this._body.position.set(0, 0, 1.20)
        this.group.add(this._body)

        // ── 左臂 ──
        this._armGroup = new THREE.Group()
        this._armGroup.position.set(0, 0, 1.40)
        this.group.add(this._armGroup)

        const armGeo   = new THREE.CylinderGeometry(0.07, 0.06, 0.45, 6)
        this._armL     = new THREE.Mesh(armGeo, matCloth)
        this._armL.rotation.z = 0.3
        this._armL.position.set( 0.26, 0, -0.1)
        this._armGroup.add(this._armL)

        this._armR     = new THREE.Mesh(armGeo, matCloth)
        this._armR.rotation.z = -0.3
        this._armR.position.set(-0.26, 0, -0.1)
        this._armGroup.add(this._armR)

        // 手（小球）
        const handGeo  = new THREE.SphereGeometry(0.07, 6, 6)
        const handL    = new THREE.Mesh(handGeo, matSkin)
        const handR    = new THREE.Mesh(handGeo, matSkin)
        handL.position.set( 0.38, 0, -0.28)
        handR.position.set(-0.38, 0, -0.28)
        this._armGroup.add(handL, handR)

        // ── 腰部 ──
        const hipGeo   = new THREE.CylinderGeometry(0.20, 0.18, 0.20, 8)
        const hip      = new THREE.Mesh(hipGeo, matPants)
        hip.rotation.x = Math.PI / 2
        hip.position.set(0, 0, 0.88)
        this.group.add(hip)

        // ── 大腿 ──
        this._legGroup = new THREE.Group()
        this._legGroup.position.set(0, 0, 0.78)
        this.group.add(this._legGroup)

        const thighGeo  = new THREE.CylinderGeometry(0.09, 0.08, 0.38, 6)

        this._thighL    = new THREE.Mesh(thighGeo, matPants)
        this._thighL.rotation.x = Math.PI / 2
        this._thighL.position.set( 0.10, 0, -0.19)
        this._legGroup.add(this._thighL)

        this._thighR    = new THREE.Mesh(thighGeo, matPants)
        this._thighR.rotation.x = Math.PI / 2
        this._thighR.position.set(-0.10, 0, -0.19)
        this._legGroup.add(this._thighR)

        // ── 小腿 ──
        const calfGeo   = new THREE.CylinderGeometry(0.08, 0.07, 0.36, 6)

        this._calfL     = new THREE.Mesh(calfGeo, matPants)
        this._calfL.rotation.x = Math.PI / 2
        this._calfL.position.set( 0.10, 0, -0.56)
        this._legGroup.add(this._calfL)

        this._calfR     = new THREE.Mesh(calfGeo, matPants)
        this._calfR.rotation.x = Math.PI / 2
        this._calfR.position.set(-0.10, 0, -0.56)
        this._legGroup.add(this._calfR)

        // ── 鞋子 ──
        const shoeGeo   = new THREE.BoxGeometry(0.16, 0.26, 0.12)
        const shoeL     = new THREE.Mesh(shoeGeo, matShoe)
        const shoeR     = new THREE.Mesh(shoeGeo, matShoe)
        shoeL.position.set( 0.10, 0.05, -0.76)
        shoeR.position.set(-0.10, 0.05, -0.76)
        this._legGroup.add(shoeL, shoeR)

        // 开启阴影
        this.group.traverse((obj) =>
        {
            if(obj.isMesh)
            {
                obj.castShadow    = true
                obj.receiveShadow = false
            }
        })
    }

    // ─────────────────────────────────────────────
    // 公开方法：由 WalkControls 每帧调用
    // ─────────────────────────────────────────────

    /**
     * 同步角色位置和朝向
     * @param {THREE.Vector3} pos    - 玩家脚底位置
     * @param {number}        yaw    - 朝向角（绕 Z 轴）
     * @param {boolean}       moving - 是否正在移动
     * @param {number}        pitch  - FPS 俯仰角（第一人称使用）
     */
    sync(pos, yaw, moving, pitch = 0)
    {
        this.position.copy(pos)
        this.facingAngle = yaw
        this._isMoving   = moving
        this._fpYaw      = yaw
        this._fpPitch    = pitch

        // 更新角色模型位置
        this.group.position.set(pos.x, pos.y, pos.z)
        this.group.rotation.set(0, 0, yaw)

        // 走路动画
        if(moving)
        {
            this._walkCycle += 0.12
            const swing = Math.sin(this._walkCycle) * 0.35
            const bob   = Math.abs(Math.sin(this._walkCycle)) * 0.04

            // 手臂摆动
            this._armL.rotation.z =  0.3 + swing
            this._armR.rotation.z = -0.3 - swing

            // 腿部摆动（通过 Z 方向旋转模拟）
            this._thighL.rotation.y = swing * 0.5
            this._thighR.rotation.y = -swing * 0.5

            // 轻微头部上下晃
            this._head.position.z = 1.72 + bob
            this._hair.position.z = 1.72 + bob
        }
        else
        {
            // 恢复默认姿势
            this._armL.rotation.z = 0.3
            this._armR.rotation.z = -0.3
            this._thighL.rotation.y = 0
            this._thighR.rotation.y = 0
            this._head.position.z = 1.72
            this._hair.position.z = 1.72
        }

        // 更新摄像机
        if(this.mode === 'third')
        {
            this._updateThirdPersonCamera()
        }
        else
        {
            this._updateFirstPersonCamera()
        }
    }

    // ─────────────────────────────────────────────
    // 摄像机更新
    // ─────────────────────────────────────────────

    _updateThirdPersonCamera()
    {
        // 绕角色做球坐标旋转
        const r   = this._camDist
        const yaw = this._camYaw
        const pit = this._camPitch

        // Z-up 球坐标：x = r*cos(pit)*sin(yaw), y = r*cos(pit)*cos(yaw), z = r*sin(pit)
        const offsetX = r * Math.cos(pit) * Math.sin(yaw)
        const offsetY = r * Math.cos(pit) * Math.cos(yaw)
        const offsetZ = r * Math.sin(pit)

        const target = this.position.clone().add(this.thirdPersonLookAtOffset)

        this.thirdCamera.position.set(
            target.x + offsetX,
            target.y + offsetY,
            target.z + offsetZ
        )

        this.thirdCamera.lookAt(target)
        this.thirdCamera.updateMatrixWorld()
    }

    _updateFirstPersonCamera()
    {
        // 眼睛位置：角色头部稍前方
        const eyeHeight = 1.65
        const eyePos = new THREE.Vector3(
            this.position.x + Math.sin(this._fpYaw) * 0.1,
            this.position.y + Math.cos(this._fpYaw) * 0.1,   // 往前一点点
            this.position.z + eyeHeight
        )
        this.firstCamera.position.copy(eyePos)

        // 朝向：yaw + pitch
        const qZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), this._fpYaw)
        const qX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), this._fpPitch)
        this.firstCamera.quaternion.multiplyQuaternions(qZ, qX)
        this.firstCamera.updateMatrixWorld()
    }

    // ─────────────────────────────────────────────
    // 视角切换
    // ─────────────────────────────────────────────

    toggleMode()
    {
        this.mode = (this.mode === 'third') ? 'first' : 'third'

        // 第一人称时隐藏角色模型
        this.group.visible = (this.mode === 'third')

        // 切换 renderPass 摄像机
        const cam = (this.mode === 'third') ? this.thirdCamera : this.firstCamera
        this.activeCamera = cam
        if(this.passes && this.passes.renderPass)
        {
            this.passes.renderPass.camera = cam
        }

        // 更新提示文字
        if(this._modeBtn)
        {
            this._modeBtn.title = this.mode === 'third' ? '切换第一人称 (V)' : '切换第三人称 (V)'
            this._modeBtn.innerHTML = this.mode === 'third' ? '👁️' : '🚶'
        }
    }

    // ─────────────────────────────────────────────
    // 第三人称鼠标环绕（Pointer Lock 状态下）
    // ─────────────────────────────────────────────

    _setupPointerLock()
    {
        document.addEventListener('mousemove', (e) =>
        {
            if(!this._pointerLocked) return

            if(this.mode === 'third')
            {
                this._camYaw   -= e.movementX * this._mouseSens
                this._camPitch -= e.movementY * this._mouseSens
                this._camPitch  = Math.max(this._camPitchMin, Math.min(this._camPitchMax, this._camPitch))
            }
            // 第一人称的鼠标由 WalkControls 处理
        })

        document.addEventListener('pointerlockchange', () =>
        {
            this._pointerLocked = document.pointerLockElement === this.renderer.domElement
        })
    }

    _setupVKeyToggle()
    {
        window.addEventListener('keydown', (e) =>
        {
            if(e.key === 'v' || e.key === 'V') this.toggleMode()
        })
    }

    _setupResizeListener()
    {
        this.sizes.on('resize', () =>
        {
            const aspect = this.sizes.viewport.width / this.sizes.viewport.height
            this.thirdCamera.aspect = aspect
            this.firstCamera.aspect = aspect
            this.thirdCamera.updateProjectionMatrix()
            this.firstCamera.updateProjectionMatrix()
        })
    }

    _setupTickUpdate()
    {
        // tick 由外部（HealingWorld._onTick）调用 sync()，不在此注册
    }

    // ─────────────────────────────────────────────
    // UI 按钮
    // ─────────────────────────────────────────────

    _buildUI()
    {
        this._modeBtn = document.createElement('button')
        this._modeBtn.id    = 'view-mode-btn'
        this._modeBtn.title = '切换第一人称 (V)'
        this._modeBtn.innerHTML = '👁️'

        Object.assign(this._modeBtn.style, {
            position:       'fixed',
            bottom:         '76px',
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
            fontSize:       '18px',
        })

        this._modeBtn.addEventListener('click', () => this.toggleMode())
        document.body.appendChild(this._modeBtn)
    }
}

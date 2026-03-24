import * as THREE from 'three'
import TimeSystem from './TimeSystem.js'
import WalkControls from './WalkControls.js'
import PlayerCharacter from './PlayerCharacter.js'

/**
 * HealingWorld - 日系治愈风郊外场景
 */
export default class HealingWorld
{
    constructor(_options)
    {
        this.config   = _options.config
        this.debug    = _options.debug
        this.time     = _options.time
        this.sizes    = _options.sizes
        this.camera   = _options.camera
        this.scene    = _options.scene
        this.renderer = _options.renderer
        this.passes   = _options.passes

        this.container = new THREE.Object3D()

        this.colors = {
            warmWhite:   0xF5E6D3,
            freshGreen:  0x8BC4A8,
            sakuraPink:  0xE8A598,
            skyBlue:     0x7BA7BC,
            grassGreen:  0x6BA882,
            darkGreen:   0x3D7A5A,
            woodBrown:   0x8B6347,
            roofGray:    0x9EB4C0,
            earthBrown:  0xA0785A,
            stonGray:    0xB0B8B8,
        }

        this._indoors = false
        this._indoorFadeAlpha = 0
        this._houseDoorWorldPos = new THREE.Vector3(3, -4, 0)

        this._setupRenderer()
        this._setupLighting()
        this._setupFog()
        this._buildGround()
        this._buildMountains()
        this._buildHouse()
        this._buildIndoorScene()
        this._buildTrees()
        this._buildFlowers()
        this._buildStones()
        this._buildSakuraParticles()
        this._buildStars()
        this._setupTimeSystem()
        this._setupWalkControls()
        this._setupPlayerCharacter()
        this._setupIndoorTransition()
        this._setupAudio()
        this._setupHUD()

        this.time.on('tick', () => this._onTick())
    }

    _setupRenderer()
    {
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping
        this.renderer.toneMappingExposure = 1.1
        this.renderer.shadowMap.enabled = true
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    }

    _setupLighting()
    {
        this.ambientLight = new THREE.AmbientLight(0xFFF5E4, 0.7)
        this.scene.add(this.ambientLight)

        this.sunLight = new THREE.DirectionalLight(0xFFD580, 1.2)
        this.sunLight.position.set(8, -6, 4)
        this.sunLight.castShadow = true
        this.sunLight.shadow.mapSize.set(2048, 2048)
        this.sunLight.shadow.camera.near = 0.5
        this.sunLight.shadow.camera.far = 80
        this.sunLight.shadow.camera.left   = -30
        this.sunLight.shadow.camera.right  =  30
        this.sunLight.shadow.camera.top    =  30
        this.sunLight.shadow.camera.bottom = -30
        this.sunLight.shadow.bias = -0.001
        this.scene.add(this.sunLight)

        this.indoorLight = new THREE.PointLight(0xFFE4C4, 1.5, 8)
        this.indoorLight.position.set(3, -2, 2)
        this.indoorLight.visible = false
        this.scene.add(this.indoorLight)
    }

    _setupFog()
    {
        this.fog = new THREE.FogExp2(0xD4E9F7, 0.015)
        this.scene.fog = this.fog
    }

    _buildGround()
    {
        const seg = 80
        const size = 120
        const geo = new THREE.PlaneGeometry(size, size, seg, seg)

        const posArr = geo.attributes.position.array
        for(let i = 0; i < posArr.length; i += 3)
        {
            const x = posArr[i]
            const y = posArr[i + 1]
            posArr[i + 2] = (Math.sin(x * 0.3) * Math.cos(y * 0.25) * 0.3 +
                             Math.random() * 0.15 - 0.075)
        }
        geo.computeVertexNormals()

        const mat = new THREE.MeshLambertMaterial({ color: this.colors.grassGreen })
        const mesh = new THREE.Mesh(geo, mat)
        mesh.receiveShadow = true
        this.container.add(mesh)
    }

    _buildMountains()
    {
        const cfgs = [
            { x:  25, y: 40, s: 1.4, h: 16, c: 0x7BA7BC },
            { x:  10, y: 45, s: 1.0, h: 12, c: 0x8FBCCC },
            { x: -15, y: 42, s: 1.2, h: 14, c: 0x7BA7BC },
            { x: -30, y: 38, s: 0.9, h: 10, c: 0x9FCADA },
            { x:  38, y: 35, s: 0.8, h: 9,  c: 0x8FBCCC },
        ]
        for(const cfg of cfgs)
        {
            const geo = new THREE.ConeGeometry(cfg.s * 8, cfg.h, 6)
            geo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2))
            const mat = new THREE.MeshLambertMaterial({ color: cfg.c })
            const mesh = new THREE.Mesh(geo, mat)
            mesh.position.set(cfg.x, cfg.y, cfg.h * 0.4)
            mesh.castShadow = true
            this.container.add(mesh)
        }
    }

    _buildHouse()
    {
        this.houseGroup = new THREE.Group()

        // 主体
        const bodyGeo = new THREE.BoxGeometry(5, 4, 3)
        const bodyMat = new THREE.MeshLambertMaterial({ color: this.colors.warmWhite })
        const body = new THREE.Mesh(bodyGeo, bodyMat)
        body.position.z = 1.5
        body.castShadow = true
        body.receiveShadow = true
        this.houseGroup.add(body)

        // 屋顶
        const roofGeo = new THREE.ConeGeometry(4, 2, 4)
        roofGeo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2))
        roofGeo.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI / 4))
        const roofMat = new THREE.MeshLambertMaterial({ color: this.colors.roofGray })
        const roof = new THREE.Mesh(roofGeo, roofMat)
        roof.position.z = 4.0
        roof.scale.set(1.3, 1.0, 1.0)
        roof.castShadow = true
        this.houseGroup.add(roof)

        // 门
        const doorMat = new THREE.MeshLambertMaterial({ color: this.colors.woodBrown })
        const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 1.8), doorMat)
        door.position.set(0, -2.05, 0.9)
        this.houseGroup.add(door)

        // 门框
        const frameMat = new THREE.MeshLambertMaterial({ color: 0x5A3D28 })
        const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 2.0), frameMat)
        doorFrame.position.set(0, -2.06, 1.0)
        this.houseGroup.add(doorFrame)

        // 正面窗
        const winMat = new THREE.MeshLambertMaterial({ color: 0x99CCEE, transparent: true, opacity: 0.7 })
        const win = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.9), winMat)
        win.position.set(-1.5, -2.06, 1.8)
        this.houseGroup.add(win)

        // 侧窗
        const winSide = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 0.9), winMat)
        winSide.position.set(-2.56, 0, 1.8)
        this.houseGroup.add(winSide)

        // 木柱（玄关）
        for(let i = -1; i <= 1; i += 2)
        {
            const postGeo = new THREE.CylinderGeometry(0.12, 0.12, 2.5, 6)
            postGeo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2))
            const post = new THREE.Mesh(postGeo, doorMat)
            post.position.set(i * 0.7, -2.3, 1.25)
            post.castShadow = true
            this.houseGroup.add(post)
        }

        // 台阶
        const step = new THREE.Mesh(
            new THREE.BoxGeometry(1.5, 0.4, 0.2),
            new THREE.MeshLambertMaterial({ color: this.colors.stonGray })
        )
        step.position.set(0, -2.3, 0.1)
        step.receiveShadow = true
        this.houseGroup.add(step)

        // 石灯笼
        this._buildLantern(this.houseGroup, -3.5, -2.5)

        this.houseGroup.position.set(3, -2, 0)
        this.container.add(this.houseGroup)

        // AABB 碰撞体（世界坐标）
        this._houseAABB = {
            min: new THREE.Vector3(0.4, -4.5, 0),
            max: new THREE.Vector3(5.6, 0.4, 6)
        }
    }

    _buildLantern(parent, lx, ly)
    {
        const stoneMat = new THREE.MeshLambertMaterial({ color: 0xBBBBBB })
        const post = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, 0.2, 1.5),
            stoneMat
        )
        post.position.set(lx, ly, 0.75)
        parent.add(post)

        const cap = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 0.5, 0.15),
            stoneMat
        )
        cap.position.set(lx, ly, 1.6)
        parent.add(cap)

        const box = new THREE.Mesh(
            new THREE.BoxGeometry(0.35, 0.35, 0.4),
            new THREE.MeshBasicMaterial({ color: 0xFFEEAA, transparent: true, opacity: 0.7 })
        )
        box.position.set(lx, ly, 1.35)
        parent.add(box)
    }

    _buildIndoorScene()
    {
        this.indoorGroup = new THREE.Group()
        this.indoorGroup.visible = false

        // 地板
        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(5, 4),
            new THREE.MeshLambertMaterial({ color: 0xD4A96A })
        )
        floor.receiveShadow = true
        this.indoorGroup.add(floor)

        // 墙壁
        const wallMat = new THREE.MeshLambertMaterial({ color: 0xF0E8D8 })
        const wallDefs = [
            [[5, 0.1, 3], [0, 2, 1.5]],
            [[0.1, 4, 3], [2.5, 0, 1.5]],
            [[0.1, 4, 3], [-2.5, 0, 1.5]],
        ]
        for(const [[w, d, h], [x, y, z]] of wallDefs)
        {
            const m = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), wallMat)
            m.position.set(x, y, z)
            this.indoorGroup.add(m)
        }

        // 桌面
        const tableTop = new THREE.Mesh(
            new THREE.BoxGeometry(1.5, 0.8, 0.1),
            new THREE.MeshLambertMaterial({ color: this.colors.woodBrown })
        )
        tableTop.position.set(0, 0.5, 0.8)
        this.indoorGroup.add(tableTop)

        // 桌腿
        const legMat = new THREE.MeshLambertMaterial({ color: 0x6B4226 })
        for(let dx of [-0.6, 0.6])
        {
            for(let dy of [-0.3, 0.3])
            {
                const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.75), legMat)
                leg.position.set(dx, dy + 0.5, 0.38)
                this.indoorGroup.add(leg)
            }
        }

        // 椅子
        const chairMat = new THREE.MeshLambertMaterial({ color: 0xE8C4A0 })
        const chairBackMat = new THREE.MeshLambertMaterial({ color: this.colors.woodBrown })
        for(const cx of [-0.5, 0.5])
        {
            const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.06), chairMat)
            seat.position.set(cx, -0.2, 0.45)
            this.indoorGroup.add(seat)

            const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.4), chairBackMat)
            back.position.set(cx, 0.08, 0.65)
            this.indoorGroup.add(back)
        }

        // 窗（发光材质模拟外景）
        const windowMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(1.2, 0.9),
            new THREE.MeshBasicMaterial({ color: 0x87CEEB, transparent: true, opacity: 0.8 })
        )
        windowMesh.position.set(-2.4, 0, 1.8)
        windowMesh.rotation.y = Math.PI / 2
        this.indoorGroup.add(windowMesh)

        // 茶杯（装饰）
        const cupGeo = new THREE.CylinderGeometry(0.08, 0.06, 0.15, 8)
        cupGeo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2))
        const cup = new THREE.Mesh(cupGeo, new THREE.MeshLambertMaterial({ color: 0xF0EAE0 }))
        cup.position.set(0.2, 0.5, 0.88)
        this.indoorGroup.add(cup)

        // 书架（简单）
        const shelfMat = new THREE.MeshLambertMaterial({ color: 0x8B6347 })
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 1.2), shelfMat)
        shelf.position.set(1.8, 1.9, 0.6)
        this.indoorGroup.add(shelf)

        // 几本书
        const bookColors = [0xE87070, 0x70B870, 0x7070E8, 0xE8C870]
        for(let bi = 0; bi < 4; bi++)
        {
            const book = new THREE.Mesh(
                new THREE.BoxGeometry(0.1, 0.08, 0.25),
                new THREE.MeshLambertMaterial({ color: bookColors[bi] })
            )
            book.position.set(1.8 + (bi - 1.5) * 0.15, 1.9, 0.85)
            this.indoorGroup.add(book)
        }

        // 室内淡入遮罩（黑色平面，靠近摄像机）
        this._indoorFadeMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(2, 2),
            new THREE.MeshBasicMaterial({
                color: 0x000000,
                transparent: true,
                opacity: 0,
                depthTest: false,
            })
        )
        this._indoorFadeMesh.renderOrder = 999
        // 放在摄像机前不会挡住其他物体，用 Scene 直接挂
        this.scene.add(this._indoorFadeMesh)

        this.indoorGroup.position.set(3, -2, 0)
        this.scene.add(this.indoorGroup)
    }

    _buildTrees()
    {
        const cfgs = [
            { x: -8,  y: -3,  th: 3.0, cr: 2.0, c: 0x5A9E6F },
            { x: -6,  y:  5,  th: 2.5, cr: 1.6, c: 0x4E8A60 },
            { x:  8,  y:  4,  th: 2.8, cr: 1.8, c: 0x6AAF7A },
            { x: 10,  y: -8,  th: 3.5, cr: 2.2, c: 0x5A9E6F },
            { x: -12, y:  2,  th: 4.0, cr: 2.5, c: 0x3D7A5A },
            { x:  0,  y: 10,  th: 2.2, cr: 1.5, c: 0x6AAF7A },
            { x: -3,  y: -10, th: 3.0, cr: 1.9, c: 0x5A9E6F },
            { x: 15,  y:  5,  th: 2.0, cr: 1.4, c: 0xEEA8B8 }, // 樱花树
            { x: 12,  y: -3,  th: 2.5, cr: 1.7, c: 0xFFBDCC }, // 樱花树
        ]

        for(const cfg of cfgs)
        {
            const group = new THREE.Group()

            const trunkGeo = new THREE.CylinderGeometry(0.18, 0.25, cfg.th, 8)
            trunkGeo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2))
            const trunk = new THREE.Mesh(trunkGeo, new THREE.MeshLambertMaterial({ color: this.colors.woodBrown }))
            trunk.position.z = cfg.th / 2
            trunk.castShadow = true
            group.add(trunk)

            const crown = new THREE.Mesh(
                new THREE.SphereGeometry(cfg.cr, 10, 8),
                new THREE.MeshLambertMaterial({ color: cfg.c })
            )
            crown.position.z = cfg.th + cfg.cr * 0.7
            crown.castShadow = true
            group.add(crown)

            group.position.set(cfg.x, cfg.y, 0)
            this.container.add(group)
        }
    }

    _buildFlowers()
    {
        const fColors = [0xE8A598, 0xFFD4E8, 0xFFFFAA, 0xFFB6C1, 0xFFC0CB]
        const pts = [
            [-4, -2], [-5, 1], [-3, 3], [1, -4], [2, -5],
            [-7, -1], [6, -1], [7, 3],  [-2, 7], [4, 7],
        ]
        for(const [x, y] of pts)
        {
            const group = new THREE.Group()
            const col = fColors[Math.floor(Math.random() * fColors.length)]

            // 花茎
            const stemGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.4, 4)
            stemGeo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2))
            const stem = new THREE.Mesh(stemGeo, new THREE.MeshLambertMaterial({ color: 0x4A7A4A }))
            stem.position.z = 0.2
            group.add(stem)

            // 花朵球
            const flower = new THREE.Mesh(
                new THREE.SphereGeometry(0.12, 8, 6),
                new THREE.MeshLambertMaterial({ color: col })
            )
            flower.position.z = 0.45
            group.add(flower)

            // 花瓣
            for(let i = 0; i < 5; i++)
            {
                const angle = (i / 5) * Math.PI * 2
                const petal = new THREE.Mesh(
                    new THREE.SphereGeometry(0.06, 6, 4),
                    new THREE.MeshLambertMaterial({ color: col })
                )
                petal.position.set(Math.cos(angle) * 0.14, Math.sin(angle) * 0.14, 0.45)
                group.add(petal)
            }

            group.position.set(x + (Math.random() - 0.5) * 0.5, y + (Math.random() - 0.5) * 0.5, 0)
            this.container.add(group)
        }
    }

    _buildStones()
    {
        const stoneDefs = [
            [-6, -4, 0.2, 0.5],
            [ 5,  2, 0.15, 0.35],
            [-3,  6, 0.25, 0.6],
            [ 8, -5, 0.2, 0.4],
            [-9,  3, 0.3, 0.5],
        ]
        for(const [x, y, h, r] of stoneDefs)
        {
            const mesh = new THREE.Mesh(
                new THREE.DodecahedronGeometry(r, 0),
                new THREE.MeshLambertMaterial({ color: this.colors.stonGray })
            )
            mesh.position.set(x, y, h)
            mesh.rotation.set(Math.random(), Math.random(), Math.random())
            mesh.castShadow = true
            mesh.receiveShadow = true
            this.container.add(mesh)
        }
    }

    _buildSakuraParticles()
    {
        const count = 600
        const positions  = new Float32Array(count * 3)
        const velocities = new Float32Array(count * 3)

        for(let i = 0; i < count; i++)
        {
            positions[i * 3]     = (Math.random() - 0.5) * 40
            positions[i * 3 + 1] = (Math.random() - 0.5) * 40
            positions[i * 3 + 2] = Math.random() * 12

            velocities[i * 3]     = (Math.random() - 0.5) * 0.012
            velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.012
            velocities[i * 3 + 2] = -(0.008 + Math.random() * 0.016)
        }

        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))

        const mat = new THREE.PointsMaterial({
            color:           0xFFB6C1,
            size:            0.25,
            transparent:     true,
            opacity:         0.85,
            depthWrite:      false,
            sizeAttenuation: true,
        })

        this._sakura = new THREE.Points(geo, mat)
        this._sakuraVelocities = velocities
        this._sakuraCount = count
        this.container.add(this._sakura)
    }

    _buildStars()
    {
        const count = 800
        const positions = new Float32Array(count * 3)
        for(let i = 0; i < count; i++)
        {
            const theta = Math.random() * Math.PI * 2
            const phi   = Math.random() * Math.PI * 0.5
            const r     = 78
            positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta)
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
            positions[i * 3 + 2] = r * Math.cos(phi)
        }
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))

        this._stars = new THREE.Points(geo, new THREE.PointsMaterial({
            color: 0xFFFFFF, size: 0.3,
            transparent: true, opacity: 0.9,
            depthWrite: false, sizeAttenuation: true,
        }))
        this._stars.visible = false
        this.scene.add(this._stars)
    }

    _setupTimeSystem()
    {
        this.timeSystem = new TimeSystem({
            scene:    this.scene,
            renderer: this.renderer,
            time:     this.time,
        })
        this.timeSystem.setLights(this.ambientLight, this.sunLight)
        this.timeSystem.setFog(this.fog)

        // 天空球
        const skyGeo = new THREE.SphereGeometry(80, 16, 12)
        skyGeo.scale(-1, -1, -1)
        const skyMat = new THREE.MeshBasicMaterial({ color: 0x87CEEB, fog: false, side: THREE.BackSide })
        this._skyMesh = new THREE.Mesh(skyGeo, skyMat)
        this.scene.add(this._skyMesh)

        this.timeSystem.setSkyMesh(this._skyMesh)

        // 监听时间变化，更新星星可见性
        this._prevPeriod = 'morning'
        this.time.on('tick', () =>
        {
            const p = this.timeSystem.getPeriod()
            if(p !== this._prevPeriod)
            {
                this._stars.visible = (p === 'night')
                this._prevPeriod = p
            }
        })
    }

    _setupWalkControls()
    {
        this.walkControls = new WalkControls({
            time:     this.time,
            sizes:    this.sizes,
            renderer: this.renderer,
            config:   this.config,
            // 摄像机由 PlayerCharacter 管理，WalkControls 只负责位置/朝向计算
            // 传入一个 dummy camera，避免 WalkControls 内部报错
            camera:   new THREE.PerspectiveCamera(),
        })

        // 添加小屋碰撞体
        this.walkControls.addCollider(this._houseAABB)

        // 提示 UI
        this._createWalkHint()
    }

    _setupPlayerCharacter()
    {
        this.player = new PlayerCharacter({
            scene:    this.scene,
            time:     this.time,
            sizes:    this.sizes,
            renderer: this.renderer,
            passes:   this.passes,
        })

        // 初始化位置同步到 WalkControls 起始位置
        const initPos = this.walkControls.position.clone()
        this.player.sync(initPos, 0, false, 0)

        // 把第三人称摄像机注入 renderPass（默认第三人称）
        if(this.passes && this.passes.renderPass)
        {
            this.passes.renderPass.camera = this.player.thirdCamera
        }
    }

    _createWalkHint()
    {
        const hint = document.createElement('div')
        hint.innerHTML = 'WASD/方向键移动 &nbsp;|&nbsp; 点击锁定鼠标转向 &nbsp;|&nbsp; T 切换时间 &nbsp;|&nbsp; V 切换视角'
        Object.assign(hint.style, {
            position:       'fixed',
            bottom:         '16px',
            left:           '50%',
            transform:      'translateX(-50%)',
            zIndex:         '900',
            padding:        '8px 16px',
            borderRadius:   '8px',
            background:     'rgba(0,0,0,0.55)',
            color:          'rgba(255,255,255,0.85)',
            fontSize:       '12px',
            backdropFilter: 'blur(8px)',
            pointerEvents:  'none',
            whiteSpace:     'nowrap',
            fontFamily:     'sans-serif',
        })
        document.body.appendChild(hint)

        // 5秒后淡出
        setTimeout(() =>
        {
            hint.style.transition = 'opacity 1s ease'
            hint.style.opacity = '0'
            setTimeout(() => hint.remove(), 1000)
        }, 8000)
    }

    _setupIndoorTransition()
    {
        this._indoorTransitioning = false
    }

    _setupAudio()
    {
        // Web Audio API - C大调钢琴序列
        try
        {
            this._audioCtx = new (window.AudioContext || window.webkitAudioContext)()
            this._audioStarted = false
            this._audioMuted = false

            // 等待用户交互后启动
            const startAudio = () =>
            {
                if(this._audioStarted) return
                this._audioStarted = true
                this._audioCtx.resume().then(() => this._playBgMusic())
                window.removeEventListener('click', startAudio)
                window.removeEventListener('keydown', startAudio)
            }
            window.addEventListener('click', startAudio)
            window.addEventListener('keydown', startAudio)
        }
        catch(e)
        {
            console.warn('[HealingWorld] Web Audio API not available', e)
        }
    }

    _playBgMusic()
    {
        if(!this._audioCtx || this._audioMuted) return

        const ctx = this._audioCtx

        // C大调音符频率（慢速钢琴）
        const notes = [
            261.63, // C4
            293.66, // D4
            329.63, // E4
            349.23, // F4
            392.00, // G4
            440.00, // A4
            493.88, // B4
            523.25, // C5
        ]

        // 简单治愈旋律
        const melody = [0, 2, 4, 7, 4, 2, 0, 2, 4, 2, 0, -1, 0, 4, 7, 4, 2, 4, 0, -1]
        const tempo   = 1.2  // 秒/拍

        let startTime = ctx.currentTime + 0.5

        for(let i = 0; i < melody.length; i++)
        {
            const noteIdx = melody[i]
            if(noteIdx < 0)
            {
                startTime += tempo
                continue
            }

            const freq = notes[noteIdx % notes.length]
            this._playNote(ctx, freq, startTime, 0.8)
            startTime += tempo
        }

        // 循环播放
        const totalDuration = melody.length * tempo * 1000
        this._bgMusicTimer = setTimeout(() =>
        {
            if(!this._audioMuted) this._playBgMusic()
        }, totalDuration)
    }

    _playNote(ctx, freq, startTime, duration)
    {
        const osc  = ctx.createOscillator()
        const gain = ctx.createGain()

        osc.type = 'sine'
        osc.frequency.value = freq

        // ADSR 包络
        gain.gain.setValueAtTime(0, startTime)
        gain.gain.linearRampToValueAtTime(0.15, startTime + 0.05)
        gain.gain.exponentialRampToValueAtTime(0.05, startTime + duration * 0.6)
        gain.gain.linearRampToValueAtTime(0, startTime + duration)

        // 泛音增加钢琴感
        const osc2 = ctx.createOscillator()
        const gain2 = ctx.createGain()
        osc2.type = 'sine'
        osc2.frequency.value = freq * 2
        gain2.gain.setValueAtTime(0, startTime)
        gain2.gain.linearRampToValueAtTime(0.04, startTime + 0.03)
        gain2.gain.exponentialRampToValueAtTime(0.001, startTime + duration * 0.4)
        osc2.connect(gain2)
        gain2.connect(ctx.destination)
        osc2.start(startTime)
        osc2.stop(startTime + duration)

        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(startTime)
        osc.stop(startTime + duration)
    }

    _setupHUD()
    {
        // 音乐开关按钮
        const btn = document.createElement('button')
        btn.title = '背景音乐'
        btn.innerHTML = '🎵'
        Object.assign(btn.style, {
            position:       'fixed',
            bottom:         '132px',
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
            outline:        'none',
            fontSize:       '18px',
        })

        btn.addEventListener('click', () =>
        {
            this._audioMuted = !this._audioMuted
            if(this._audioMuted)
            {
                clearTimeout(this._bgMusicTimer)
                btn.style.opacity = '0.4'
            }
            else
            {
                btn.style.opacity = '1'
                if(this._audioCtx) this._playBgMusic()
            }
        })

        document.body.appendChild(btn)
    }

    // ─────────────────────────────────────────────
    // 每帧更新
    // ─────────────────────────────────────────────

    _onTick()
    {
        // 同步玩家角色位置/朝向/动画
        if(this.player && this.walkControls)
        {
            const pos     = this.walkControls.position
            const yaw     = this.walkControls.yaw
            const pitch   = this.walkControls.pitch || 0
            const moving  = this.walkControls.keys
                ? (this.walkControls.keys.forward || this.walkControls.keys.backward ||
                   this.walkControls.keys.left    || this.walkControls.keys.right)
                : false
            this.player.sync(pos, yaw, moving, pitch)
        }

        this._updateSakura()
        this._updateIndoorTransition()
        this._updateFadeMesh()
    }

    _updateSakura()
    {
        if(!this._sakura) return
        const pos = this._sakura.geometry.attributes.position.array
        const vel = this._sakuraVelocities

        for(let i = 0; i < this._sakuraCount; i++)
        {
            pos[i * 3]     += vel[i * 3]
            pos[i * 3 + 1] += vel[i * 3 + 1]
            pos[i * 3 + 2] += vel[i * 3 + 2]

            // 超出边界时重置
            if(pos[i * 3 + 2] < 0)
            {
                pos[i * 3]     = (Math.random() - 0.5) * 40
                pos[i * 3 + 1] = (Math.random() - 0.5) * 40
                pos[i * 3 + 2] = 10 + Math.random() * 4
            }
        }
        this._sakura.geometry.attributes.position.needsUpdate = true
    }

    _updateIndoorTransition()
    {
        if(!this.walkControls) return

        const playerPos  = this.walkControls.position
        const dist = playerPos.distanceTo(this._houseDoorWorldPos)
        const threshold = 3.0

        if(dist < threshold && !this._indoors)
        {
            this._indoors = true
            this.indoorGroup.visible = true
            this.indoorLight.visible = true
        }
        else if(dist >= threshold && this._indoors)
        {
            this._indoors = false
            this.indoorGroup.visible = false
            this.indoorLight.visible = false
        }
    }

    _updateFadeMesh()
    {
        const activeCam = this.player ? this.player.activeCamera : null
        if(!this._indoorFadeMesh || !activeCam) return

        // 遮罩跟随摄像机，保持在视口近处
        const cam = activeCam
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion)
        this._indoorFadeMesh.position.copy(cam.position).addScaledVector(forward, 0.5)
        this._indoorFadeMesh.quaternion.copy(cam.quaternion)

        // 平滑过渡 alpha
        const targetAlpha = this._indoors ? 0 : 0
        this._indoorFadeMesh.material.opacity += (targetAlpha - this._indoorFadeMesh.material.opacity) * 0.1
    }
}

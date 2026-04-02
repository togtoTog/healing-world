import * as THREE from 'three'
import * as dat from 'dat.gui'

import Sizes from './Utils/Sizes.js'
import Time from './Utils/Time.js'
import World from './World/index.js'
import Resources from './Resources.js'
import Camera from './Camera.js'
import FirstPersonCamera from './FirstPersonCamera.js'
import PlacedObjects from './World/PlacedObjects.js'
import PlaceMenu from './World/PlaceMenu.js'

import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import BlurPass from './Passes/Blur.js'
import GlowsPass from './Passes/Glows.js'

// 引入放置菜单样式
import '../style/place-menu.css'

export default class Application
{
    /**
     * Constructor
     */
    constructor(_options)
    {
        // Options
        this.$canvas = _options.$canvas

        // Set up
        this.time = new Time()
        this.sizes = new Sizes()
        this.resources = new Resources()

        this.setConfig()
        this.setDebug()
        this.setRenderer()
        this.setCamera()
        this.setFirstPersonCamera()
        this.setPasses()
        this.setWorld()
        this.setPlacement()
        this.setTitle()
    }

    /**
     * Set config
     */
    setConfig()
    {
        this.config = {}
        this.config.debug = window.location.hash === '#debug'
        this.config.touch = false

        window.addEventListener('touchstart', () =>
        {
            this.config.touch = true
            // 治愈世界中 controls.setTouch 是空操作，不影响
            if(this.world && this.world.controls)
            {
                this.world.controls.setTouch()
            }
        }, { once: true })
    }

    /**
     * Set debug
     */
    setDebug()
    {
        if(this.config.debug)
        {
            this.debug = new dat.GUI({ width: 420 })
        }
    }

    /**
     * Set renderer
     */
    setRenderer()
    {
        // Scene
        this.scene = new THREE.Scene()

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.$canvas,
            alpha: true,
            powerPreference: 'high-performance'
        })
        this.renderer.setClearColor(0x87CEEB, 1)
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        this.renderer.setSize(this.sizes.viewport.width, this.sizes.viewport.height)
        this.renderer.autoClear = false

        // Resize event
        this.sizes.on('resize', () =>
        {
            this.renderer.setSize(this.sizes.viewport.width, this.sizes.viewport.height)
        })
    }

    /**
     * Set camera
     */
    setCamera()
    {
        this.camera = new Camera({
            time: this.time,
            sizes: this.sizes,
            renderer: this.renderer,
            debug: this.debug,
            config: this.config
        })

        this.scene.add(this.camera.container)

        // 在治愈世界中，不再跟踪小车；摄像机由 WalkControls 直接控制
        // 下面的 tick 监听只是保留兼容性
        this.time.on('tick', () =>
        {
            // 治愈世界：不需要跟踪 car
        })
    }

    /**
     * Set first person camera
     * 注：治愈世界里视角切换由 PlayerCharacter 管理（V 键），此处不再初始化
     */
    setFirstPersonCamera()
    {
        // 已由 PlayerCharacter 接管，保留空方法避免报错
        this.firstPersonCamera = null
    }

    setPasses()
    {
        this.passes = {}

        // Debug
        if(this.debug)
        {
            this.passes.debugFolder = this.debug.addFolder('postprocess')
        }

        this.passes.composer = new EffectComposer(this.renderer)

        // renderPass 初始使用 camera.instance，world 创建后会被 WalkControls 更新为步行摄像机
        this.passes.renderPass = new RenderPass(this.scene, this.camera.instance)

        this.passes.horizontalBlurPass = new ShaderPass(BlurPass)
        this.passes.horizontalBlurPass.strength = this.config.touch ? 0 : 0
        this.passes.horizontalBlurPass.material.uniforms.uResolution.value = new THREE.Vector2(this.sizes.viewport.width, this.sizes.viewport.height)
        this.passes.horizontalBlurPass.material.uniforms.uStrength.value = new THREE.Vector2(0, 0)

        this.passes.verticalBlurPass = new ShaderPass(BlurPass)
        this.passes.verticalBlurPass.strength = this.config.touch ? 0 : 0
        this.passes.verticalBlurPass.material.uniforms.uResolution.value = new THREE.Vector2(this.sizes.viewport.width, this.sizes.viewport.height)
        this.passes.verticalBlurPass.material.uniforms.uStrength.value = new THREE.Vector2(0, 0)

        // 治愈世界：使用淡暖色 glow
        this.passes.glowsPass = new ShaderPass(GlowsPass)
        this.passes.glowsPass.color = '#ffe8d0'
        this.passes.glowsPass.material.uniforms.uPosition.value = new THREE.Vector2(0.5, 0.8)
        this.passes.glowsPass.material.uniforms.uRadius.value = 0.6
        this.passes.glowsPass.material.uniforms.uColor.value = new THREE.Color(this.passes.glowsPass.color)
        this.passes.glowsPass.material.uniforms.uColor.value.convertLinearToSRGB()
        this.passes.glowsPass.material.uniforms.uAlpha.value = 0.18

        // Add passes
        this.passes.composer.addPass(this.passes.renderPass)
        this.passes.composer.addPass(this.passes.horizontalBlurPass)
        this.passes.composer.addPass(this.passes.verticalBlurPass)
        this.passes.composer.addPass(this.passes.glowsPass)

        // Time tick
        this.time.on('tick', () =>
        {
            this.passes.horizontalBlurPass.enabled = this.passes.horizontalBlurPass.material.uniforms.uStrength.value.x > 0
            this.passes.verticalBlurPass.enabled   = this.passes.verticalBlurPass.material.uniforms.uStrength.value.y > 0

            // FirstPersonCamera V 键视角：WalkControls 管步行摄像机，FPS 相机是叠加的
            // 在治愈世界里，我们始终使用步行摄像机（_walkCamera），不需要切换
            // FirstPersonCamera 的 V 键功能被保留但不影响主渲染摄像机

            this.passes.composer.render()
        })

        // Resize event
        this.sizes.on('resize', () =>
        {
            this.renderer.setSize(this.sizes.viewport.width, this.sizes.viewport.height)
            this.passes.composer.setSize(this.sizes.viewport.width, this.sizes.viewport.height)
            this.passes.horizontalBlurPass.material.uniforms.uResolution.value.x = this.sizes.viewport.width
            this.passes.horizontalBlurPass.material.uniforms.uResolution.value.y = this.sizes.viewport.height
            this.passes.verticalBlurPass.material.uniforms.uResolution.value.x = this.sizes.viewport.width
            this.passes.verticalBlurPass.material.uniforms.uResolution.value.y = this.sizes.viewport.height
        })
    }

    /**
     * Set world
     */
    setWorld()
    {
        this.world = new World({
            config:   this.config,
            debug:    this.debug,
            resources: this.resources,
            time:     this.time,
            sizes:    this.sizes,
            camera:   this.camera,
            scene:    this.scene,
            renderer: this.renderer,
            passes:   this.passes
        })
        this.scene.add(this.world.container)
    }

    /**
     * Set placement system (Phase 2)
     * 初始化 PlacedObjects 和 PlaceMenu，并连接 E 键 / 按钮交互
     */
    setPlacement()
    {
        // ── PlacedObjects ──────────────────────────────
        // 获取活跃摄像机的函数（第一/第三人称动态切换）
        const getActiveCamera = () =>
        {
            const player = this.world && this.world._healing && this.world._healing.player
            if(player && player.activeCamera) return player.activeCamera
            return this.camera.instance
        }

        this.placedObjects = new PlacedObjects({
            scene:    this.scene,
            camera:   getActiveCamera,   // 传入函数，支持动态切换
            renderer: this.renderer,
            sizes:    this.sizes,
            time:     this.time,
        })

        // ── PlaceMenu ──────────────────────────────────
        this.placeMenu = new PlaceMenu()

        // ── 右下角「放置」触发按钮 ─────────────────────
        const triggerBtn = document.createElement('button')
        triggerBtn.id    = 'place-trigger-btn'
        triggerBtn.title = '放置内容 (E)'
        triggerBtn.textContent = '+'
        document.body.appendChild(triggerBtn)

        triggerBtn.addEventListener('click', () =>
        {
            this._togglePlaceMenu()
        })

        // ── E 键开关菜单 ───────────────────────────────
        window.addEventListener('keydown', (e) =>
        {
            // 如果焦点在输入框内，不拦截 E 键
            const tag = document.activeElement && document.activeElement.tagName
            if(tag === 'INPUT' || tag === 'TEXTAREA') return

            if(e.key === 'e' || e.key === 'E')
            {
                e.preventDefault()
                this._togglePlaceMenu()
            }
        })

        // ── 监听 place-object 事件执行放置 ────────────
        window.addEventListener('place-object', (e) =>
        {
            const { type, data, position } = e.detail
            this._placeObject(type, data, position)
        })
    }

    /**
     * 切换放置菜单
     */
    _togglePlaceMenu()
    {
        const targetPos = this._getPlacementPosition()
        this.placeMenu.toggle(targetPos)
    }

    /**
     * 计算玩家前方 5 单位的放置坐标
     */
    _getPlacementPosition()
    {
        const player = this.world && this.world._healing && this.world._healing.player
        const walkControls = this.world && this.world._healing && this.world._healing.walkControls

        if(player && walkControls)
        {
            const pos = walkControls.position.clone()
            const yaw = walkControls.yaw || 0

            // 玩家前方方向（Z-up 坐标系，yaw 绕 Z 轴）
            const forward = new THREE.Vector3(
                Math.sin(yaw),
                Math.cos(yaw),
                0
            )
            pos.addScaledVector(forward, 5)
            pos.z += 1.2  // 稍微抬高，放到视线高度
            return pos
        }

        // fallback：摄像机前方
        const cam = this.passes.renderPass.camera
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion)
        return cam.position.clone().addScaledVector(dir, 5)
    }

    /**
     * 执行放置动作
     */
    _placeObject(type, data, position)
    {
        switch(type)
        {
            case 'text':
                this.placedObjects.addText(data.text, position)
                break
            case 'image':
                this.placedObjects.addImage(data.url, position)
                break
            case 'video':
                this.placedObjects.addVideo(data.url, position)
                break
            case 'model':
                this.placedObjects.addModel(position, data.modelName)
                break
            default:
                console.warn('[Application] 未知放置类型:', type)
        }
    }

    /**
     * Set title
     */
    setTitle()
    {
        // 治愈世界标题
        document.title = '🌸 日系治愈小屋 🌸'
    }

    /**
     * Destructor
     */
    destructor()
    {
        this.time.off('tick')
        this.sizes.off('resize')
        this.camera.orbitControls.dispose()
        this.renderer.dispose()
        if(this.debug) this.debug.destroy()
    }
}

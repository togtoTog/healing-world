import * as THREE from 'three'
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'

/**
 * PlacedObjects - 开放世界内容放置管理器
 * 负责创建、管理和渲染用户放置的各类内容对象
 *
 * 支持类型：text / image / video / model
 */
export default class PlacedObjects
{
    constructor(_options)
    {
        this.scene    = _options.scene
        this.camera   = _options.camera   // 活跃摄像机引用（函数或对象）
        this.renderer = _options.renderer
        this.sizes    = _options.sizes
        this.time     = _options.time

        // 所有已放置的物件数组
        this.objects = []

        // 当前悬停/选中状态
        this._hoveredId  = null
        this._selectedId = null

        // 唯一 ID 计数器
        this._idCounter = 0

        // 选中操控 UI
        this._controlUI = null

        // Raycaster 用于悬停与点击检测
        this._raycaster  = new THREE.Raycaster()
        this._mouse      = new THREE.Vector2()

        // CSS2DRenderer 负责渲染文字标签
        this._css2dRenderer = new CSS2DRenderer()
        this._css2dRenderer.setSize(this.sizes.viewport.width, this.sizes.viewport.height)
        this._css2dRenderer.domElement.style.position = 'absolute'
        this._css2dRenderer.domElement.style.top      = '0'
        this._css2dRenderer.domElement.style.left     = '0'
        this._css2dRenderer.domElement.style.pointerEvents = 'none'
        document.body.appendChild(this._css2dRenderer.domElement)

        // 尺寸变化时同步
        this.sizes.on('resize', () =>
        {
            this._css2dRenderer.setSize(this.sizes.viewport.width, this.sizes.viewport.height)
        })

        // 鼠标事件（悬停 + 点击）
        this._setupMouseEvents()

        // Delete 键删除选中物件
        this._setupDeleteKey()

        // 每帧渲染 CSS2DRenderer
        this.time.on('tick', () => this._onTick())
    }

    // ─────────────────────────────────────────────
    // 公共放置方法
    // ─────────────────────────────────────────────

    /**
     * 放置文字标签（CSS2DObject）
     * @param {string} text
     * @param {THREE.Vector3} position
     */
    addText(text, position)
    {
        const div = document.createElement('div')
        div.className = 'placed-text-label'
        div.textContent = text

        const label = new CSS2DObject(div)
        label.position.copy(position)
        this.scene.add(label)

        // 为悬停检测创建一个不可见的锚点 mesh
        const anchorGeo = new THREE.SphereGeometry(0.4, 8, 6)
        const anchorMat = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0,
            depthWrite: false
        })
        const anchor = new THREE.Mesh(anchorGeo, anchorMat)
        anchor.position.copy(position)
        this.scene.add(anchor)

        const id = this._nextId()
        const obj = { id, type: 'text', mesh: anchor, label, data: { text }, position: position.clone() }
        anchor.userData.placedObjectId = id
        this.objects.push(obj)

        return id
    }

    /**
     * 放置图片平面（TextureLoader）
     * @param {string} url
     * @param {THREE.Vector3} position
     */
    addImage(url, position)
    {
        const geo = new THREE.PlaneGeometry(2, 1.5)

        // 先用占位材质，加载完成后替换
        const mat = new THREE.MeshBasicMaterial({
            color: 0xFFFFFF,
            side: THREE.DoubleSide,
            transparent: true
        })

        const mesh = new THREE.Mesh(geo, mat)
        mesh.position.copy(position)
        mesh.position.z += 1.0  // 稍微抬高
        // 让图片面朝上（XY 平面）
        mesh.rotation.x = -Math.PI / 2
        this.scene.add(mesh)

        // 加载纹理
        const loader = new THREE.TextureLoader()
        loader.load(
            url,
            (texture) =>
            {
                texture.colorSpace = THREE.SRGBColorSpace
                mat.map = texture
                mat.needsUpdate = true
                // 调整比例
                const aspect = texture.image.width / texture.image.height
                mesh.scale.x = aspect
            },
            undefined,
            (err) =>
            {
                console.warn('[PlacedObjects] 图片加载失败:', url, err)
                mat.color.set(0xFF6B6B)
                mat.needsUpdate = true
            }
        )

        const id = this._nextId()
        const obj = { id, type: 'image', mesh, data: { url }, position: position.clone() }
        mesh.userData.placedObjectId = id
        this.objects.push(obj)

        return id
    }

    /**
     * 放置视频平面（VideoTexture）
     * @param {string} url
     * @param {THREE.Vector3} position
     */
    addVideo(url, position)
    {
        const video = document.createElement('video')
        video.src     = url
        video.loop    = true
        video.muted   = true  // 自动播放需要静音
        video.playsInline = true
        video.crossOrigin = 'anonymous'
        video.play().catch(() => {})

        const texture = new THREE.VideoTexture(video)
        texture.colorSpace = THREE.SRGBColorSpace

        const geo = new THREE.PlaneGeometry(2.8, 1.6)
        const mat = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.DoubleSide,
        })

        const mesh = new THREE.Mesh(geo, mat)
        mesh.position.copy(position)
        mesh.position.z += 1.0
        mesh.rotation.x = -Math.PI / 2
        this.scene.add(mesh)

        const id = this._nextId()
        const obj = { id, type: 'video', mesh, data: { url, video }, position: position.clone() }
        mesh.userData.placedObjectId = id
        this.objects.push(obj)

        return id
    }

    /**
     * 放置 3D 模型占位体（BoxGeometry）
     * @param {THREE.Vector3} position
     * @param {string} [modelName]
     */
    addModel(position, modelName = 'box')
    {
        const shapes = {
            box:      () => new THREE.BoxGeometry(0.8, 0.8, 0.8),
            sphere:   () => new THREE.SphereGeometry(0.5, 12, 10),
            cylinder: () => new THREE.CylinderGeometry(0.3, 0.4, 1.0, 10),
            torus:    () => new THREE.TorusGeometry(0.4, 0.15, 10, 24),
        }

        const geo = (shapes[modelName] || shapes.box)()
        // Three.js 默认 Y-up，需要旋转到 Z-up 场景
        geo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2))

        const mat = new THREE.MeshLambertMaterial({
            color: 0xFFAFCC,
            emissive: 0x220011
        })
        const mesh = new THREE.Mesh(geo, mat)
        mesh.position.copy(position)
        mesh.position.z += 0.5
        mesh.castShadow = true
        this.scene.add(mesh)

        // 旋转动画
        mesh.userData._spinSpeed = 0.01 + Math.random() * 0.01

        const id = this._nextId()
        const obj = { id, type: 'model', mesh, data: { modelName }, position: position.clone() }
        mesh.userData.placedObjectId = id
        this.objects.push(obj)

        return id
    }

    /**
     * 移除指定 ID 的物件
     * @param {number} id
     */
    removeObject(id)
    {
        const idx = this.objects.findIndex(o => o.id === id)
        if(idx === -1) return

        const obj = this.objects[idx]
        this.scene.remove(obj.mesh)

        // 清理几何体/材质
        if(obj.mesh.geometry) obj.mesh.geometry.dispose()
        if(obj.mesh.material)
        {
            if(obj.mesh.material.map) obj.mesh.material.map.dispose()
            obj.mesh.material.dispose()
        }

        // 清理文字标签
        if(obj.label)
        {
            this.scene.remove(obj.label)
            if(obj.label.element && obj.label.element.parentNode)
            {
                obj.label.element.parentNode.removeChild(obj.label.element)
            }
        }

        // 清理视频
        if(obj.data && obj.data.video)
        {
            obj.data.video.pause()
            obj.data.video.src = ''
        }

        this.objects.splice(idx, 1)

        if(this._selectedId === id)
        {
            this._selectedId = null
            this._hideControlUI()
        }
        if(this._hoveredId === id)
        {
            this._hoveredId = null
        }
    }

    /**
     * 序列化所有放置物件（用于持久化）
     */
    serialize()
    {
        return this.objects.map(obj =>
        {
            const { id, type, position } = obj
            const data = { ...obj.data }
            // 不序列化 video DOM 元素
            delete data.video
            return {
                id,
                type,
                position: { x: position.x, y: position.y, z: position.z },
                data
            }
        })
    }

    // ─────────────────────────────────────────────
    // 内部方法
    // ─────────────────────────────────────────────

    _nextId()
    {
        return ++this._idCounter
    }

    _getActiveCamera()
    {
        if(typeof this.camera === 'function') return this.camera()
        return this.camera
    }

    _setupMouseEvents()
    {
        const canvas = document.querySelector('canvas')
        if(!canvas) return

        // 悬停检测
        canvas.addEventListener('mousemove', (e) =>
        {
            const rect = canvas.getBoundingClientRect()
            this._mouse.x = ((e.clientX - rect.left) / rect.width)  * 2 - 1
            this._mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1
        })

        // 点击选中
        canvas.addEventListener('click', (e) =>
        {
            this._handleClick()
        })
    }

    _setupDeleteKey()
    {
        window.addEventListener('keydown', (e) =>
        {
            if(e.key === 'Delete' && this._selectedId !== null)
            {
                this.removeObject(this._selectedId)
            }
        })
    }

    _handleClick()
    {
        const cam = this._getActiveCamera()
        if(!cam) return

        this._raycaster.setFromCamera(this._mouse, cam)
        const meshes = this.objects.map(o => o.mesh).filter(Boolean)
        const hits   = this._raycaster.intersectObjects(meshes, false)

        if(hits.length > 0)
        {
            const id = hits[0].object.userData.placedObjectId
            if(id !== undefined)
            {
                this._selectObject(id)
            }
        }
        else
        {
            // 点击空白处取消选中
            this._deselectAll()
        }
    }

    _selectObject(id)
    {
        this._deselectAll()
        this._selectedId = id
        const obj = this.objects.find(o => o.id === id)
        if(!obj) return

        // 高亮（存储原始颜色）
        this._applyHighlight(obj, true)

        // 显示操控 UI
        this._showControlUI(obj)
    }

    _deselectAll()
    {
        if(this._selectedId !== null)
        {
            const obj = this.objects.find(o => o.id === this._selectedId)
            if(obj) this._applyHighlight(obj, false)
        }
        this._selectedId = null
        this._hideControlUI()
    }

    _applyHighlight(obj, on)
    {
        if(!obj.mesh || !obj.mesh.material) return
        const mat = obj.mesh.material
        if(on)
        {
            obj._origColor = mat.color ? mat.color.clone() : null
            obj._origEmissive = mat.emissive ? mat.emissive.clone() : null
            if(mat.emissive) mat.emissive.set(0x88CCFF)
            if(mat.color)    mat.color.set(0xADE8FF)
        }
        else
        {
            if(mat.emissive && obj._origEmissive) mat.emissive.copy(obj._origEmissive)
            if(mat.color    && obj._origColor)    mat.color.copy(obj._origColor)
        }
    }

    _showControlUI(obj)
    {
        this._hideControlUI()

        const ui = document.createElement('div')
        ui.id = 'placed-object-controls'
        ui.innerHTML = `
            <div class="poc-title">${this._typeLabel(obj.type)}</div>
            <div class="poc-btns">
                <button class="poc-btn poc-delete" data-id="${obj.id}">🗑️ 删除</button>
            </div>
        `
        document.body.appendChild(ui)
        this._controlUI = ui

        ui.querySelector('.poc-delete').addEventListener('click', (e) =>
        {
            const id = parseInt(e.currentTarget.dataset.id)
            this.removeObject(id)
        })
    }

    _hideControlUI()
    {
        if(this._controlUI && this._controlUI.parentNode)
        {
            this._controlUI.parentNode.removeChild(this._controlUI)
        }
        this._controlUI = null
    }

    _typeLabel(type)
    {
        const map = { text: '📝 文字', image: '🖼️ 图片', video: '🎬 视频', model: '🧊 3D 物品' }
        return map[type] || type
    }

    _onTick()
    {
        const cam = this._getActiveCamera()
        if(!cam) return

        // CSS2DRenderer 渲染
        this._css2dRenderer.render(this.scene, cam)

        // 旋转 model 类型
        for(const obj of this.objects)
        {
            if(obj.type === 'model' && obj.mesh && obj.mesh.userData._spinSpeed)
            {
                obj.mesh.rotation.z += obj.mesh.userData._spinSpeed
            }
        }

        // 悬停高亮检测
        this._raycaster.setFromCamera(this._mouse, cam)
        const meshes = this.objects.map(o => o.mesh).filter(Boolean)
        const hits   = this._raycaster.intersectObjects(meshes, false)

        const newHoverId = hits.length > 0 ? hits[0].object.userData.placedObjectId : null

        if(newHoverId !== this._hoveredId)
        {
            // 取消上一个悬停高亮（如果不是选中对象）
            if(this._hoveredId !== null && this._hoveredId !== this._selectedId)
            {
                const prevObj = this.objects.find(o => o.id === this._hoveredId)
                if(prevObj) this._applyHighlight(prevObj, false)
            }

            this._hoveredId = newHoverId

            // 应用新悬停高亮（如果不是选中对象）
            if(newHoverId !== null && newHoverId !== this._selectedId)
            {
                const hoverObj = this.objects.find(o => o.id === newHoverId)
                if(hoverObj) this._applyHighlight(hoverObj, true)
            }

            // 更新鼠标指针样式
            const canvas = document.querySelector('canvas')
            if(canvas) canvas.style.cursor = newHoverId !== null ? 'pointer' : ''
        }
    }

    /**
     * 清理所有资源
     */
    dispose()
    {
        const ids = this.objects.map(o => o.id)
        for(const id of ids) this.removeObject(id)

        if(this._css2dRenderer.domElement.parentNode)
        {
            this._css2dRenderer.domElement.parentNode.removeChild(this._css2dRenderer.domElement)
        }
    }
}

/**
 * PlaceMenu - 开放世界内容放置菜单
 * 纯 DOM 操作，不依赖 Three.js
 *
 * 事件：window 上 dispatch 自定义事件 'place-object'
 *   detail: { type, data, position: THREE.Vector3 }
 */
export default class PlaceMenu
{
    constructor()
    {
        this._visible       = false
        this._targetPosition = null  // THREE.Vector3，放置目标位置（玩家前方 5 单位）
        this._activeTab     = 'text'

        this._buildDOM()
        this._bindEvents()
    }

    // ─────────────────────────────────────────────
    // 公共 API
    // ─────────────────────────────────────────────

    /**
     * 显示菜单
     * @param {THREE.Vector3} targetPosition - 要放置的世界坐标
     */
    show(targetPosition)
    {
        this._targetPosition = targetPosition
        this._el.classList.add('pm-visible')
        this._visible = true

        // 聚焦当前 tab 的第一个输入框
        setTimeout(() =>
        {
            const input = this._el.querySelector('.pm-tab-pane.active input, .pm-tab-pane.active textarea')
            if(input) input.focus()
        }, 150)
    }

    /**
     * 隐藏菜单
     */
    hide()
    {
        this._el.classList.remove('pm-visible')
        this._visible = false
    }

    /**
     * 切换显示/隐藏
     * @param {THREE.Vector3} targetPosition
     */
    toggle(targetPosition)
    {
        if(this._visible) this.hide()
        else              this.show(targetPosition)
    }

    get isVisible() { return this._visible }

    // ─────────────────────────────────────────────
    // DOM 构建
    // ─────────────────────────────────────────────

    _buildDOM()
    {
        this._el = document.createElement('div')
        this._el.id = 'place-menu'
        this._el.innerHTML = `
            <div class="pm-header">
                <span class="pm-title">🌸 放置内容</span>
                <button class="pm-close" title="关闭 (E)">✕</button>
            </div>

            <div class="pm-tabs">
                <button class="pm-tab active" data-tab="text">📝 文字</button>
                <button class="pm-tab" data-tab="image">🖼️ 图片</button>
                <button class="pm-tab" data-tab="video">🎬 视频</button>
                <button class="pm-tab" data-tab="model">🧊 3D 物品</button>
            </div>

            <div class="pm-tab-panes">

                <!-- 文字 Tab -->
                <div class="pm-tab-pane active" data-pane="text">
                    <label class="pm-label">文字内容</label>
                    <textarea
                        id="pm-text-input"
                        class="pm-input pm-textarea"
                        placeholder="输入要浮空显示的文字…"
                        rows="3"
                    ></textarea>
                    <button class="pm-place-btn" data-type="text">🌱 放置到当前位置</button>
                </div>

                <!-- 图片 Tab -->
                <div class="pm-tab-pane" data-pane="image">
                    <label class="pm-label">图片 URL</label>
                    <input
                        id="pm-image-url"
                        class="pm-input"
                        type="url"
                        placeholder="https://example.com/image.jpg"
                    />
                    <div class="pm-hint">支持 JPG、PNG、WebP 等格式</div>
                    <button class="pm-place-btn" data-type="image">🌱 放置到当前位置</button>
                </div>

                <!-- 视频 Tab -->
                <div class="pm-tab-pane" data-pane="video">
                    <label class="pm-label">视频 URL</label>
                    <input
                        id="pm-video-url"
                        class="pm-input"
                        type="url"
                        placeholder="https://example.com/video.mp4"
                    />
                    <div class="pm-hint">支持 MP4 格式，视频将静音自动播放</div>
                    <button class="pm-place-btn" data-type="video">🌱 放置到当前位置</button>
                </div>

                <!-- 3D 物品 Tab -->
                <div class="pm-tab-pane" data-pane="model">
                    <label class="pm-label">选择形状</label>
                    <div class="pm-model-grid">
                        <button class="pm-model-btn active" data-model="box">📦 方块</button>
                        <button class="pm-model-btn" data-model="sphere">⚽ 球体</button>
                        <button class="pm-model-btn" data-model="cylinder">🥛 圆柱</button>
                        <button class="pm-model-btn" data-model="torus">🍩 圆环</button>
                    </div>
                    <button class="pm-place-btn" data-type="model">🌱 放置到当前位置</button>
                </div>

            </div>

            <div class="pm-footer">
                <span class="pm-shortcut">按 <kbd>E</kbd> 关闭 &nbsp;·&nbsp; <kbd>Delete</kbd> 删除选中</span>
            </div>
        `
        document.body.appendChild(this._el)
    }

    _bindEvents()
    {
        // 关闭按钮
        this._el.querySelector('.pm-close').addEventListener('click', () => this.hide())

        // 点击菜单外部关闭（仅点击遮罩区域）
        // 使用 stopPropagation 阻止菜单内部点击冒泡到 window
        this._el.addEventListener('click', e => e.stopPropagation())

        // Tab 切换
        this._el.querySelectorAll('.pm-tab').forEach(tab =>
        {
            tab.addEventListener('click', () =>
            {
                const name = tab.dataset.tab
                this._switchTab(name)
            })
        })

        // 模型选择按钮
        this._el.querySelectorAll('.pm-model-btn').forEach(btn =>
        {
            btn.addEventListener('click', () =>
            {
                this._el.querySelectorAll('.pm-model-btn').forEach(b => b.classList.remove('active'))
                btn.classList.add('active')
                this._selectedModel = btn.dataset.model
            })
        })
        this._selectedModel = 'box'

        // 放置按钮
        this._el.querySelectorAll('.pm-place-btn').forEach(btn =>
        {
            btn.addEventListener('click', () =>
            {
                this._handlePlace(btn.dataset.type)
            })
        })
    }

    _switchTab(name)
    {
        this._activeTab = name

        this._el.querySelectorAll('.pm-tab').forEach(t =>
            t.classList.toggle('active', t.dataset.tab === name)
        )
        this._el.querySelectorAll('.pm-tab-pane').forEach(p =>
            p.classList.toggle('active', p.dataset.pane === name)
        )

        // 自动聚焦输入框
        setTimeout(() =>
        {
            const input = this._el.querySelector(`.pm-tab-pane.active input, .pm-tab-pane.active textarea`)
            if(input) input.focus()
        }, 50)
    }

    _handlePlace(type)
    {
        if(!this._targetPosition)
        {
            console.warn('[PlaceMenu] 未设置 targetPosition')
            return
        }

        let data = {}
        let valid = true

        switch(type)
        {
            case 'text':
            {
                const text = this._el.querySelector('#pm-text-input').value.trim()
                if(!text)
                {
                    this._showError('请输入文字内容')
                    valid = false
                    break
                }
                data = { text }
                break
            }
            case 'image':
            {
                const url = this._el.querySelector('#pm-image-url').value.trim()
                if(!url)
                {
                    this._showError('请输入图片 URL')
                    valid = false
                    break
                }
                data = { url }
                break
            }
            case 'video':
            {
                const url = this._el.querySelector('#pm-video-url').value.trim()
                if(!url)
                {
                    this._showError('请输入视频 URL')
                    valid = false
                    break
                }
                data = { url }
                break
            }
            case 'model':
            {
                data = { modelName: this._selectedModel || 'box' }
                break
            }
        }

        if(!valid) return

        // 派发自定义事件
        const event = new CustomEvent('place-object', {
            detail: {
                type,
                data,
                position: this._targetPosition.clone()
            }
        })
        window.dispatchEvent(event)

        // 清空输入并关闭菜单
        this._clearInputs(type)
        this.hide()

        // 短暂的成功反馈
        this._showSuccess()
    }

    _clearInputs(type)
    {
        switch(type)
        {
            case 'text':
                const ta = this._el.querySelector('#pm-text-input')
                if(ta) ta.value = ''
                break
            case 'image':
                const imgInput = this._el.querySelector('#pm-image-url')
                if(imgInput) imgInput.value = ''
                break
            case 'video':
                const vidInput = this._el.querySelector('#pm-video-url')
                if(vidInput) vidInput.value = ''
                break
        }
    }

    _showError(msg)
    {
        this._showToast(msg, 'error')
    }

    _showSuccess()
    {
        this._showToast('✅ 放置成功！', 'success')
    }

    _showToast(msg, type = 'info')
    {
        const toast = document.createElement('div')
        toast.className = `pm-toast pm-toast-${type}`
        toast.textContent = msg
        document.body.appendChild(toast)

        // 触发动画
        requestAnimationFrame(() =>
        {
            toast.classList.add('pm-toast-visible')
        })

        setTimeout(() =>
        {
            toast.classList.remove('pm-toast-visible')
            setTimeout(() => toast.remove(), 300)
        }, 2000)
    }

    /**
     * 清理 DOM
     */
    dispose()
    {
        if(this._el && this._el.parentNode)
        {
            this._el.parentNode.removeChild(this._el)
        }
    }
}

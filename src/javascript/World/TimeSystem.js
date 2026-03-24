import * as THREE from 'three'

/**
 * TimeSystem - 时间切换系统
 * 支持早晨、黄昏、夜晚三个时间段
 * 按 T 键或点击右下角按钮循环切换
 */
export default class TimeSystem
{
    constructor(_options)
    {
        this.scene    = _options.scene
        this.renderer = _options.renderer
        this.time     = _options.time

        // 时间段定义
        this.periods = ['morning', 'dusk', 'night']
        this.currentIndex = 0
        this.currentPeriod = 'morning'

        // 各时段配置
        this.configs = {
            morning: {
                skyColor:       new THREE.Color(0x87CEEB),   // 淡蓝天空
                fogColor:       new THREE.Color(0xD4E9F7),
                fogDensity:     0.015,
                ambientColor:   new THREE.Color(0xFFF5E4),
                ambientIntensity: 0.7,
                sunColor:       new THREE.Color(0xFFD580),
                sunIntensity:   1.2,
                sunPosition:    new THREE.Vector3(8, -6, 4),  // Z-up: 右侧低角度
                bgColor:        new THREE.Color(0x87CEEB),
                exposure:       1.1,
            },
            dusk: {
                skyColor:       new THREE.Color(0xFF6B35),
                fogColor:       new THREE.Color(0xFF8C60),
                fogDensity:     0.018,
                ambientColor:   new THREE.Color(0xFF9966),
                ambientIntensity: 0.5,
                sunColor:       new THREE.Color(0xFF7720),
                sunIntensity:   0.9,
                sunPosition:    new THREE.Vector3(-10, -5, 2),
                bgColor:        new THREE.Color(0xE05A2B),
                exposure:       1.0,
            },
            night: {
                skyColor:       new THREE.Color(0x0D1B3E),
                fogColor:       new THREE.Color(0x0A1428),
                fogDensity:     0.025,
                ambientColor:   new THREE.Color(0x223355),
                ambientIntensity: 0.25,
                sunColor:       new THREE.Color(0xCCDDFF),   // 月光
                sunIntensity:   0.4,
                sunPosition:    new THREE.Vector3(3, 2, 12),
                bgColor:        new THREE.Color(0x0D1B3E),
                exposure:       0.7,
            }
        }

        this._lights = null    // 由 HealingWorld 注入
        this._skyMesh = null   // 天空球 mesh

        this._setupKeyboard()
        this._createUI()
        this._applyPeriod('morning', true)
    }

    /** 由 HealingWorld 调用，注入灯光和天空引用 */
    setLights(ambientLight, sunLight)
    {
        this._ambientLight = ambientLight
        this._sunLight = sunLight
    }

    setSkyMesh(mesh)
    {
        this._skyMesh = mesh
    }

    setFog(fog)
    {
        this._fog = fog
    }

    /** 切换到下一时间段 */
    next()
    {
        this.currentIndex = (this.currentIndex + 1) % this.periods.length
        this.currentPeriod = this.periods[this.currentIndex]
        this._applyPeriod(this.currentPeriod, false)
    }

    getPeriod()
    {
        return this.currentPeriod
    }

    // ─────────────────────────────────────────────
    // 内部方法
    // ─────────────────────────────────────────────

    _applyPeriod(periodName, instant)
    {
        const cfg = this.configs[periodName]
        if(!cfg) return

        const duration = instant ? 0 : 2.0

        if(this._ambientLight)
        {
            this._ambientLight.color.set(cfg.ambientColor)
            this._ambientLight.intensity = cfg.ambientIntensity
        }

        if(this._sunLight)
        {
            this._sunLight.color.set(cfg.sunColor)
            this._sunLight.intensity = cfg.sunIntensity
            this._sunLight.position.copy(cfg.sunPosition)
        }

        if(this._fog)
        {
            this._fog.color.set(cfg.fogColor)
            this._fog.density = cfg.fogDensity
        }

        if(this.scene)
        {
            this.scene.background = cfg.bgColor.clone()
        }

        if(this.renderer)
        {
            this.renderer.toneMappingExposure = cfg.exposure
        }

        if(this._skyMesh)
        {
            this._skyMesh.material.color.set(cfg.skyColor)
        }

        // 更新 UI 按钮标签
        this._updateButton()
    }

    _setupKeyboard()
    {
        window.addEventListener('keydown', (e) =>
        {
            if(e.key === 't' || e.key === 'T')
            {
                this.next()
            }
        })
    }

    _createUI()
    {
        const labels = { morning: '🌅 早晨', dusk: '🌆 黄昏', night: '🌙 夜晚' }

        this._btn = document.createElement('button')
        this._btn.id = 'time-toggle-btn'
        this._btn.title = '切换时间 (T)'

        Object.assign(this._btn.style, {
            position:        'fixed',
            bottom:          '80px',
            right:           '24px',
            zIndex:          '1000',
            minWidth:        '90px',
            height:          '36px',
            borderRadius:    '18px',
            border:          '2px solid rgba(255,255,255,0.4)',
            background:      'rgba(0,0,0,0.5)',
            color:           '#fff',
            cursor:          'pointer',
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
            backdropFilter:  'blur(8px)',
            transition:      'all 0.3s ease',
            outline:         'none',
            fontSize:        '13px',
            padding:         '0 12px',
            fontFamily:      'sans-serif',
        })

        this._btn.addEventListener('click', () => this.next())
        document.body.appendChild(this._btn)

        this._labels = labels
        this._updateButton()
    }

    _updateButton()
    {
        if(this._btn && this._labels)
        {
            this._btn.textContent = this._labels[this.currentPeriod]
        }
    }
}

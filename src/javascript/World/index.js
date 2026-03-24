/**
 * World/index.js - 治愈风场景入口
 * 使用 HealingWorld 替换原有赛车展示世界
 */
import HealingWorld from './HealingWorld.js'

export default class World
{
    constructor(_options)
    {
        // 直接委托给 HealingWorld
        this._healing = new HealingWorld(_options)

        // 暴露 container，让 Application 可以 scene.add(this.world.container)
        this.container = this._healing.container

        // 暴露 walkControls（供 Application 引用）
        this.walkControls = this._healing.walkControls

        // 暴露 timeSystem
        this.timeSystem = this._healing.timeSystem

        // 保持与旧 World 接口的最低兼容性
        // Application 会访问 this.world.car / this.world.physics 用于摄像机跟踪
        // 我们返回 null 即可，Application 里已有判断
        this.car     = null
        this.physics = null

        // controls.setTouch 兼容（Application.setConfig 里会调用）
        this.controls = {
            setTouch: () => {}
        }
    }
}

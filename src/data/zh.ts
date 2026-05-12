import type { ResumeData } from './types'

export const zh: ResumeData = {
  name: 'Zack Wong',
  tagline: '$ full_stack_engineer --blockchain --ai',
  contact: {
    email: 'zack.wong@gmail.com',
    linkedin: 'linkedin.com/in/zackwong',
    location: 'Hong Kong',
  },
  summary:
    '全栈工程师，14 年开发经验，覆盖游戏服务端、区块链基础设施与生产级 Web 系统。从早年在 Gameloft 开发 C++ MMORPG 服务端，到近年主导非托管区块链支付平台从 0 到 1 的架构与上线。擅长排查生产环境的跨服务疑难问题，并在 AI 工具辅助的开发流程下，独立负责架构决策、安全评审与上线准备。',
  skills: [
    {
      category: 'Languages',
      items: ['Golang', 'TypeScript/JavaScript', 'C++', 'HTML/CSS'],
    },
    {
      category: 'Backend',
      items: ['Gin', 'RESTful APIs', 'GraphQL', 'gRPC', 'Microservices'],
    },
    {
      category: 'Frontend',
      items: ['React', 'Vue 3', 'Next.js', 'Vite', 'Tailwind CSS'],
    },
    {
      category: 'Blockchain',
      items: ['Ethereum/BSC', 'EIP-712', 'Permit2', 'ERC-20', 'TRON'],
    },
    {
      category: 'Databases',
      items: ['MongoDB', 'MySQL', 'Redis', 'Elasticsearch'],
    },
    {
      category: 'Cloud & DevOps',
      items: ['AWS (EC2, S3, SQS)', 'Docker', 'GitHub Actions', 'Nginx'],
    },
  ],
  experience: [
    {
      company: 'BitABC.io',
      location: '香港',
      title: '全栈工程师',
      period: '2026.01 -- 至今',
      bullets: [
        '主导整体架构设计，把非托管区块链支付系统拆成 5 个相互独立的服务（Go 结算后端、商户 API、React 管理后台、TypeScript SDK、文档站），划清服务边界，让每个模块都能独立部署',
        '上线前提前发现 3 个关键隐患——各层超时配置不一致（交易层 30 秒 vs Nginx 链路 75 秒）、K8s 优雅停机时的竞态、RPC 节点单点故障——从根本上避免了上线首日的交易丢失与服务中断',
        '规划交易处理链路的三阶段演进路线（receipt 轮询 → 本地 nonce 管理 → Replace-by-Fee 加速 gas），每一步都以线上真实数据作为推进条件，避免过度设计',
        '借助 AI 编程工具完成 5+ 个生产服务的交付，自己掌控架构决策、代码审查、安全评估与跨服务集成测试，单人开发周期缩短 60% 以上',
      ],
      tech: ['Golang', 'Gin', 'React', 'TypeScript', 'MongoDB', 'Redis', 'AWS SQS', 'EIP-712', 'Permit2', 'Docker'],
    },
    {
      company: 'Aither Entertainment Limited',
      location: '香港',
      title: '后端工程师',
      period: '2022.05 -- 2025.05',
      bullets: [
        '用 Golang 构建并持续迭代 NFT 交易平台的 GraphQL API 后端，同时支持 Ronin 与 Polygon 双链，处理跨链资产查询与用户账户管理',
        '接手测试覆盖率极低的老项目，逐步补齐单元测试至 80% 以上覆盖率，在大版本发布前提前拦下多次回归问题',
        '接入 Google、Apple、Discord 的 OAuth 2.0 社交登录，去掉新用户注册时的密码门槛，降低注册环节的流失',
        '接手一个加载越来越慢的 TypeScript Web 商城，定位到根因是客户端反复请求相同 API，改造为服务端缓存——页面加载速度提升 200%+，API 调用量大幅下降',
      ],
      tech: ['Golang', 'Gin', 'GraphQL', 'MongoDB', 'Elasticsearch', 'TypeScript', 'AWS'],
    },
    {
      company: 'DIGITCUBE.com Co., Ltd',
      location: '香港',
      title: '程序分析师',
      period: '2019.06 -- 2022.04',
      bullets: [
        '独立完成网页游戏的全栈开发（Golang 后端 + TypeScript/Egret Engine 前端），同时负责实时游戏逻辑与客户端渲染',
        '设计并落地双链支付服务，在 Ethereum 与 TRON 上完成 USDT 转账，让游戏内购与提现绕开传统中心化支付通道',
        '引入 Consul 做服务发现与动态配置管理，去掉硬编码的服务地址，让整套微服务可以零停机更新配置',
      ],
      tech: ['Golang', 'gRPC', 'Gin', 'TypeScript', 'Ethereum', 'Egret Engine'],
    },
    {
      company: '智科通讯有限公司',
      location: '深圳',
      title: '后端开发工程师',
      period: '2018.05 -- 2019.04',
      bullets: [
        '用 Golang 设计并维护高并发游戏服务器后端，负责实时玩家会话管理与游戏状态同步',
        '搭建内部管理后台的 RESTful API，让运营人员不用直接动数据库就能管理玩家账户、游戏活动与各项配置',
        '用 pprof 对线上游戏服务器做性能分析，定位并解决 CPU 与内存占用高的热点函数，明显减少高峰期的延迟抖动',
      ],
      tech: ['Golang', 'MySQL', 'Redis', 'JavaScript'],
    },
    {
      company: '微米动力科技有限公司',
      location: '深圳',
      title: '游戏开发工程师',
      period: '2017.03 -- 2018.04',
      bullets: [
        '用 C++ 开发手机 MMORPG 的客户端与服务端，实现核心战斗机制以及数千玩家并发的实时状态同步',
        '通过 Valgrind 排查 C++ 游戏服务器的内存泄漏与 CPU 瓶颈，让服务端在线上负载下保持稳定运行',
        '接入腾讯 Bugly 完成线上崩溃监控与 Android 端热更新，无需重新过审就能实时感知故障并下发补丁',
      ],
      tech: ['C++', 'Android Java', 'MySQL'],
    },
    {
      company: 'Mobvista 汇量科技',
      location: '广州',
      title: '后端开发工程师',
      period: '2014.06 -- 2017.01',
      bullets: [
        '参与两款已上线手游（MMORPG 与 ARPG）的 C++ 服务端开发，在已有线上系统的约束下扩展核心玩法，同时保证线上稳定',
        '搭建游戏事件埋点链路，采集玩家行为数据（登录、付费、在线时长），为运营团队分析玩家流失环节提供数据依据',
        '开发机器人客户端工具模拟大规模玩家并发请求，用于上线前压测，摸清服务器承载上限，避免带病上线',
      ],
      tech: ['C++', 'MFC', 'Protobuf', 'Google Test', 'MySQL'],
    },
    {
      company: 'Gameloft 智乐软件',
      location: '深圳',
      title: '游戏开发工程师',
      period: '2012.01 -- 2014.06',
      bullets: [
        '参与《混沌与秩序》（Order & Chaos）MMORPG 中国区定制版的交付，在 Gameloft 的研发流程内完成内容本地化、支付流程与网络层的国内适配',
        '设计并实现游戏资源的增量更新系统，缩小补丁包体积，玩家更新版本时无需重新整包下载安装',
        '排查并修复 C++ 客户端与服务端的线上 Bug，保障这款活跃玩家在线的 MMORPG 稳定运营',
      ],
      tech: ['C++', 'Android Java', 'gameswf', 'Batch Scripting'],
    },
  ],
  education: {
    school: '深圳大学',
    period: '2007.09 -- 2011.06',
    degree: '软件工程 学士学位',
  },
  labels: {
    summary: '个人简介',
    skills: '技术技能',
    experience: '工作经历',
    education: '教育背景',
    present: '至今',
    back: '← 返回',
  },
}

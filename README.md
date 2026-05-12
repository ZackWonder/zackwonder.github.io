**Zack Wong**
*zack.wong@gmail.com | LinkedIn: linkedin.com/in/zackwong | Hong Kong*

*$ full_stack_engineer --blockchain --ai*

---

### **Summary**

Full Stack Engineer with 14 years of experience across game servers, blockchain infrastructure, and production web systems. Started out shipping C++ MMORPG servers at Gameloft, and now architect a non-custodial blockchain payment platform from the ground up. Strong track record of diagnosing complex cross-service failures in production, and of owning architecture, security, and launch readiness end-to-end while working alongside AI coding tools.

---

### **Skills**

| Category | Technologies |
|----------|-------------|
| **Languages** | Golang, TypeScript/JavaScript, C++, HTML/CSS |
| **Backend** | Gin, RESTful APIs, GraphQL, gRPC, Microservices |
| **Frontend** | React, Vue 3, Next.js, Vite, Tailwind CSS |
| **Blockchain** | Ethereum/BSC, EIP-712, Permit2, ERC-20, TRON |
| **Databases** | MongoDB, MySQL, Redis, Elasticsearch |
| **Cloud & DevOps** | AWS (EC2, S3, SQS), Docker, GitHub Actions, Nginx |

---

### **Experience**

#### **BitABC.io** (Hong Kong)
*Full Stack Engineer* | Jan 2026 -- Present

- Architected a non-custodial blockchain payment system as 5 interconnected services (Go settlement backend, merchant API, React dashboard, TypeScript SDK, documentation site), with clear service boundaries and independently deployable modules
- Caught 3 critical issues before launch — misaligned timeouts across the stack (30s tx timeout vs 75s Nginx), race conditions during K8s graceful shutdown, and an RPC single point of failure — preventing transaction loss and downtime on day one
- Designed a 3-phase rollout plan for the transaction pipeline (receipt polling → local nonce management → Replace-by-Fee gas bumping), gating each phase on real production metrics to avoid premature optimization
- Leveraged AI coding assistants to ship 5+ production services in parallel while personally owning architecture decisions, code review, security evaluation, and cross-service integration — cutting solo delivery time by 60%+

*Tech: Golang | Gin | React | TypeScript | MongoDB | Redis | AWS SQS | EIP-712 | Permit2 | Docker*

#### **Aither Entertainment Limited** (Hong Kong)
*Backend Engineer* | May 2022 -- May 2025

- Built and scaled a GraphQL API backend in Golang for a live NFT marketplace across Ronin and Polygon, handling cross-chain asset queries and user account management
- Inherited a codebase with minimal test coverage and wrote comprehensive unit tests to bring it above 80%, catching regressions before every major release
- Integrated OAuth 2.0 social login for Google, Apple, and Discord, removing password-based signup friction for new users
- Took over a slow-loading TypeScript web store, traced the root cause to repeated client-side API fetches, and moved caching to the server — improving page load speed by 200%+ and significantly cutting redundant API calls

*Tech: Golang | Gin | GraphQL | MongoDB | Elasticsearch | TypeScript | AWS*

#### **DIGITCUBE.com Co., Ltd** (Hong Kong)
*Analyst Programmer* | Jun 2019 -- Apr 2022

- Led full-stack development of web-based games (Golang backend + TypeScript/Egret Engine frontend), owning real-time game logic and client rendering end to end
- Designed and shipped a dual-chain payment service for USDT transfers on Ethereum and TRON, letting in-game purchases and withdrawals bypass centralized payment processors
- Introduced Consul for service discovery and dynamic configuration, removing hardcoded service endpoints and enabling zero-downtime config updates across all microservices

*Tech: Golang | gRPC | Gin | TypeScript | Ethereum | Egret Engine*

#### **Zhike Communication Co., Ltd** (Shenzhen)
*Back-end Developer* | May 2018 -- Apr 2019

- Designed and maintained high-concurrency game server backends in Golang, handling real-time player sessions and in-game state synchronization
- Built RESTful APIs for an internal admin portal so game operators could manage player accounts, events, and configuration without touching the database directly
- Profiled production game servers with pprof, identified and resolved CPU and memory hotspots, and noticeably reduced latency spikes during peak traffic

*Tech: Golang | MySQL | Redis | JavaScript*

#### **Weme Power Technology Co., Ltd** (Shenzhen)
*Game Developer* | Mar 2017 -- Apr 2018

- Built client and server systems for a mobile MMORPG in C++, implementing core combat mechanics and real-time state sync across thousands of concurrent players
- Used Valgrind to find and fix memory leaks and CPU bottlenecks in the C++ game server, keeping long-running instances stable under production load
- Integrated Tencent Bugly for live crash tracking and OTA hotfix delivery on Android, enabling real-time fault visibility and patch deployment without going through app store review

*Tech: C++ | Android Java | MySQL*

#### **Mobvista** (Guangzhou)
*Back-end Developer* | Jun 2014 -- Jan 2017

- Contributed to server-side C++ development for two live mobile games (MMORPG and ARPG), extending core gameplay systems while keeping production stable
- Designed a game event tracking pipeline that captured player behavior (login, purchase, session length) to surface drop-off patterns for the live-ops team
- Built bot clients that simulated large concurrent player loads, enabling load testing that revealed server limits before launch

*Tech: C++ | MFC | Protobuf | Google Test | MySQL*

#### **Gameloft** (Shenzhen)
*Game Developer* | Jan 2012 -- Jun 2014

- Delivered the China-market version of Order & Chaos (MMORPG) — localizing content, payment flows, and network behavior as part of Gameloft's live operations
- Designed and implemented an incremental resource update system for game patches, reducing patch size and eliminating full reinstalls between versions
- Triaged and resolved production bugs across C++ client and server codebases, keeping a live MMORPG with an active player base running stably

*Tech: C++ | Android Java | gameswf | Batch Scripting*

---

### **Education**

**Shenzhen University** | Sep 2007 -- Jun 2011
Bachelor of Software Engineering

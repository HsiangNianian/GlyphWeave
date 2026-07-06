# GlyphWeave → Bevy 迁移：P1 地基设计

- 日期：2026-07-07
- 范围：仅 P1（桌面地基）。P2–P5 各自再出独立 spec。
- 状态：已通过头脑风暴评审，待用户复核后进入实现计划（writing-plans）。

---

## 1. 背景

GlyphWeave 是一个无限画布 ASCII roguelike tilemap 编辑器。当前仓库内**已有三套实现**：

- `src/`：React 19 + Konva + Tailwind v4 + Zustand + shadcn/ui（浏览器版，生产主力）
- `godot/`：Godot 4 + GDScript（进行中的原生端口）
- `server/`：Cloudflare Workers + @napi-rs/canvas（PNG 渲染 API）

### 迁移动机（头脑风暴结论）

- **核心目标**：性能与扩展性。现有 Konva/Godot 扛不住想要的规模。
- **瓶颈（全选）**：超大地图渲染吞吐、复杂模拟与计算、交互帧率卡顿、更丰富的视觉表达。
- **平台**：桌面优先，Web(WASM) 兜底。
- **架构路线**：方案 A——纯 Bevy + `bevy_egui` 单体。React 实现保留作产品/视觉参考；Godot 端口已弃用并移除（见 `chore(godot): remove abandoned godot port`）。

### 迁移分阶段

| 阶段 | 内容 | 状态 |
|---|---|---|
| **P1 基石** | Rust 骨架 + Bevy 桌面 + 数据模型(chunk) + 渲染 + 基础笔刷/平移缩放 + `.gemap` round-trip | **本文档** |
| P2 编辑器 UI | egui 面板：工具栏/调色板/图层/导出/设置 | 待 spec |
| P3 工具完整性 | 油漆桶/选择/撤销重做/小地图/快捷键/真·无限流式 | 待 spec |
| P4 引擎化 | 多线程模拟/光照/fog/寻路 | 待 spec |
| P5 Web 端 | WASM + WebGPU 构建 + 加载优化 | 待 spec |

---

## 2. P1 目标与非目标

### 目标

1. 桌面（Linux/Windows/macOS）跑通 Bevy 窗口。
2. 加载并渲染现有 `.gemap` v2 文件（以 `examples/grand-realm-of-aethra.gemap` 为验收样本）。
3. 在 layer-1 上用笔刷绘画（brush + erase）。
4. 滚轮缩放（以鼠标为中心）+ 拖拽平移，流畅。
5. 存回 `.gemap` v2，与原文件**语义等价**（round-trip 测试通过）。
6. 最小 egui 叠层显示 FPS + 鼠标所在 tile 坐标。
7. `core` crate 单元测试 + round-trip 集成测试全绿。

### 非目标（明确延后）

- 油漆桶、选择、撤销重做、小地图、预设、主题切换 UI。
- 全套 egui 编辑器面板（P2）。
- 多图层编辑 UI（P1 多图层仅**只读叠加渲染**）。
- 模拟 / 光照 / fog / 寻路（P4）。
- WASM 构建（P5）。
- 真·无限画布流式（P3；P1 为有界地图）。

---

## 3. 仓库与 crate 结构

新建顶层 `bevy/` 目录，Cargo workspace，**双 crate**：

```
bevy/
├── Cargo.toml                          # [workspace]，members = crates/*
├── assets/
│   └── fonts/                          # 等宽字体（与现 src/ 的 geist 字体对应）
└── crates/
    ├── core/                           # glyphweave-core：纯逻辑，零 Bevy 依赖
    │   ├── Cargo.toml
    │   └── src/
    │       ├── lib.rs
    │       ├── tile.rs                 # TileKind enum + serde rename
    │       ├── layer.rs                # Layer
    │       ├── chunk.rs                # Chunk, ChunkGrid, CHUNK_SIZE=32
    │       ├── world.rs                # World（源真相）
    │       ├── coords.rs               # 世界↔chunk↔局部 坐标变换
    │       ├── edit.rs                 # EditEvent / 笔刷工具（纯函数，改 World）
    │       ├── gemap.rs                # serde 模型 ↔ .gemap v2（"x,y" key）
    │       └── error.rs                # CoreError（thiserror）
    └── app/                            # glyphweave-app：Bevy 应用
        ├── Cargo.toml
        └── src/
            ├── main.rs                 # App 构建、Plugin 注册
            ├── resource.rs             # World 包成 Bevy Resource
            ├── input.rs                # 鼠标/键盘 → EditEvent / 相机指令
            ├── tool.rs                 # 处理 EditEvent，改 World（调用 core::edit）
            ├── render/                 # 渲染 view 层（隔离，便于 P4 替换）
            │   ├── mod.rs
            │   ├── atlas.rs            # 启动烘焙 26-tile × 1 主题 字形图集
            │   └── tilemap.rs          # bevy_ecs_tilemap 同步
            ├── render_sync.rs          # World 变化 → 更新被改 tile 的 texture index
            ├── camera.rs               # 正交相机平移/缩放
            └── ui.rs                   # bevy_egui 叠层（FPS + tile 坐标）
```

### 为什么拆 core / app

- `core` 不依赖 Bevy → 可纯单测（chunk 操作、坐标、serde round-trip）。
- P4 换/加渲染层（自定义 shader/光照）时不碰 `core`。
- P5 WASM 复用：`core` 天然 WASM 可移植。
- 成本极小（一个 workspace + 两个 crate），收益贯穿 P2–P5。

### 现有代码处置

`src/`(React) 在 P1–P4 期间**保留作产品/视觉参考**，不删除。`godot/` 端口已移除（见 `chore(godot): remove abandoned godot port`）。

---

## 4. 数据模型（`core`，地基核心）

### 4.1 TileKind

`#[repr(u8)]` enum，26 个 variant，每个用 `#[serde(rename = "...")]` 精确匹配现有 camelCase id：

```rust
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
#[repr(u8)]
pub enum TileKind {
    #[serde(rename = "void")]       Void,
    #[serde(rename = "wall")]       Wall,
    #[serde(rename = "floor")]      Floor,
    #[serde(rename = "floorAlt")]   FloorAlt,
    #[serde(rename = "door")]       Door,
    // ... 其余 21 个，rename 与 src/constants/tiles.ts 完全一致
}
```

- `Void` 表示空 tile（不存储 / 透明）。
- 未知 id（前向兼容）：反序列化时映射为 `Void` 并记录警告。

### 4.2 Layer

```rust
pub struct Layer {
    pub id: String,        // "layer-1" 等
    pub name: String,      // "Terrain"
    pub visible: bool,
    pub locked: bool,
}
```

### 4.3 Chunk + ChunkGrid（分块存储）

```rust
pub const CHUNK_SIZE: i32 = 32;
pub const CHUNK_AREA: usize = (CHUNK_SIZE as usize) * (CHUNK_SIZE as usize); // 1024

pub struct Chunk {
    pub tiles: Box<[Option<TileKind>; CHUNK_AREA]>, // None = 空
}

pub struct ChunkGrid {
    pub chunks: HashMap<(i32, i32), Chunk>, // key = chunk 坐标
}
```

- `CHUNK_SIZE = 32`：每 chunk 1024 tile、约 1KB（`Option<u8>`）~4KB，缓存友好。
- 空 chunk 不分配 → 稀疏，支持大/无限地图。
- 选 chunk 而非扁平 HashMap 的理由：百万级 tile 下，渲染同步 / flood fill / 模拟读会先在扁平 HashMap 上成为瓶颈；现在加少量代码避免日后推翻数据模型；并为 P3 真·无限流式（按相机 spawn/despawn chunk 实体）铺路。

### 4.4 World（源真相）

```rust
pub struct World {
    pub version: u32,                          // 2
    pub world_name: String,
    pub tile_size: u32,                        // 24
    pub theme_id: String,                      // "ansi-16"
    pub layers: Vec<Layer>,
    pub grids: HashMap<String, ChunkGrid>,     // key = layer id
    pub active_layer: String,                  // P1 固定 = layers[0].id
}
```

`World` 是**唯一源真相**：工具改它、serde 序列化它、渲染读它。

> 命名注意：Bevy 自身有 `bevy::prelude::World`（ECS 世界）。在 `app` 侧把 `core::World`
> 包成 newtype 资源 `WorldModel(pub core::World)` 注入 ECS，避免与 Bevy 的 `World` 冲突。
> 本 spec 后文「`World` Resource」均指这个 `WorldModel`。

### 4.5 坐标变换（`coords.rs`）

世界 tile 坐标可为负（无限画布）。使用 Euclid 除法：

```rust
// 世界 tile → chunk 坐标
let cx = tx.div_euclid(CHUNK_SIZE);
let cy = ty.div_euclid(CHUNK_SIZE);
// 世界 tile → chunk 内局部坐标
let lx = tx.rem_euclid(CHUNK_SIZE);
let ly = ty.rem_euclid(CHUNK_SIZE);
// chunk 内线性索引
let idx = (ly as usize) * CHUNK_SIZE as usize + lx as usize;
```

> 注意：Rust 的 `/` 与 `%` 向零截断，负坐标必须用 `div_euclid`/`rem_euclid`，否则会写错 chunk。

### 4.6 工具（`edit.rs`）

纯函数，接收 `&mut World` 与目标，改动 chunk：

```rust
pub enum Edit {
    Set { layer: String, tx: i32, ty: i32, kind: TileKind },
    Erase { layer: String, tx: i32, ty: i32 }, // = Set(Void)，但会清理空 chunk
}

pub fn apply(world: &mut World, edit: &Edit) { ... }
```

- 写入时按需创建 chunk（`grids.entry(layer).chunks.entry((cx,cy)).or_insert_with(empty)`）。
- 擦除后若整 chunk 全空，可选回收（P1 先不回收，留到 P3 优化）。

---

## 5. `.gemap` 序列化（`gemap.rs`）

### 5.1 现有 schema（已核实）

```json
{
  "version": 2,
  "tiles":       { "x,y": "tileId" },                   // 扁平（旧版兼容）
  "layerTiles":  { "layer-1": { "x,y": "tileId" }, ... },// v2 多图层
  "layers":      [ { "id", "name", "visible", "locked" } ],
  "worldName":   "...",
  "tileSize":    24,
  "themeId":     "ansi-16"
}
```

坐标 key 为字符串 `"x,y"`；tile id 为 camelCase。

### 5.2 serde 映射

- `World` ↔ 一个 `GemapFile` 中间结构（字段名用 `#[serde(rename_all = "camelCase")]`：`worldName`、`tileSize`、`themeId`、`layerTiles`）。
- `"x,y"` ↔ `(i32, i32)`：自定义 `serialize_with` / `deserialize_with`，把 `HashMap<(i32,i32), TileKind>` 序列化成 `{"x,y": "kind"}`。
- **加载**：优先读 `layerTiles`（v2）；若只有 `tiles`（v1），整体当作 `layer-1`。
- **保存**：同时写出 `layerTiles`（权威）与 `tiles`（layer-1 扁平，向后兼容），匹配现有文件结构。
- **未知 tile id** → `Void` + 警告（不报错）。

### 5.3 Round-trip 等价性

- 测试以**语义等价**为准（重新加载后 `World` 相等），不强求字节相同（key 顺序可能不同）。
- 验收样本：`examples/grand-realm-of-aethra.gemap`（120×80，三图层，472KB）。

---

## 6. 渲染（`app/render/`，view 层）

### 6.1 选型

- **用 `bevy_ecs_tilemap`** 做 P1 渲染：自带 GPU 实例化 + chunk + 视口剔除，"百万 tile 流畅"开箱即用。
- **隔离在 `render/` 模块**，只暴露 `RenderView { spawn(world), set_tile(...), despawn() }` 之类接口。P4 上自定义 shader/光照/fog 时可整层替换，不碰 `core`。

### 6.2 字形图集（`atlas.rs`）——P1 简化方案

- P1 **只烘焙一个主题（ansi-16）**。把 26 个 tile 各自预渲染成一张 "字+前景色+背景色" 的图块，组成 26 格 atlas。
- 因此 P1 渲染只需**一个 tilemap**，`TileTextureIndex = TileKind as u16`，无需运行时着色。
- 主题切换（P2+）改为重新烘焙 atlas 或切换到 tint 方案，届时再细化。

### 6.3 图层叠加

- 多图层 → 多个 Tilemap entity 按 z 排序叠加（terrain < structures < details）。
- P1 多图层只**读 World 渲染**，不可编辑（编辑只走 `active_layer`）。
- `visible: false` 的 layer 不渲染。

### 6.4 画布范围

- P1 为**有界**地图：按加载世界尺寸创建 tilemap（demo 最大 120×80；实现支持到 ~4096×4096）。
- 真·无限流式（chunk 实体随相机 spawn/despawn）延后到 P3。

### 6.5 相机（`camera.rs`）

- `OrthographicProjection`，2D。
- 滚轮缩放，以**鼠标位置为中心**（先平移使鼠标对应世界点不变，再缩放）。
- 中键/右键拖拽平移。

---

## 7. 数据流（Bevy 系统）

```
鼠标/键盘
   │
   ▼
InputSystem (input.rs) ──► EditEvent { layer, tx, ty, kind }  ┐
                  └──► CameraCmd { zoom_to_cursor, pan_delta }│ (走相机系统)
   │                                                          │
   ▼                                                          ▼
ToolSystem (tool.rs): apply(world, edit)        CameraSystem (camera.rs)
   │  改 World Resource 的 chunk
   ▼
MapChanged 事件 / 标记
   ▼
RenderSyncSystem (render_sync.rs): 只更新被改 tile 的 TileTextureIndex
   ▼
bevy_ecs_tilemap ──► GPU
```

- `World` 包成 `Resource<WorldModel>`。
- 编辑走事件（`Events<EditEvent>`），便于 P3 接 undo/redo（事件即历史记录单元）。
- `RenderSyncSystem` 只改被 touch 的 tile，不全量重建。

---

## 8. UI 外壳（`app/ui.rs`）

- `bevy_egui` 叠层（非独占窗口），P1 只显示：
  - FPS / 帧时间
  - 鼠标当前 tile 坐标 `(tx, ty)`
  - 当前主题 / 世界名
  - 加载/保存按钮（触发文件对话框，或读固定路径用于 P1 验证）
- 全套面板（调色板/图层/导出/设置）= P2。

---

## 9. 错误处理

| 场景 | 处理 |
|---|---|
| `.gemap` 解析失败 | 日志 + egui 错误条 + 回退空世界（**不 panic**） |
| 缺文件 | 空世界 |
| 未知 tile id | 降级 `Void` + 警告 |
| 字体 / atlas 资源缺失 | 启动硬错（资源必须存在） |
| `core` 内部不变量违反 | `thiserror` typed error，向上传播 |

---

## 10. 测试策略

全在 `glyphweave-core`（不依赖 Bevy）：

- **`chunk.rs`**：get/set/erase、跨 chunk 边界、负坐标、空 chunk 不存在。
- **`coords.rs`**：世界↔chunk↔局部 变换，含负数边界用例（`div_euclid`/`rem_euclid` 正确性）。
- **`gemap.rs`**：加载 → `World` → 保存 → 重载，语义等价；v1（仅 `tiles`）兼容；未知 id 降级；以 `grand-realm-of-aethra.gemap` 为样本。
- **`edit.rs`**：笔刷 set/erase，按需创建 chunk。

`glyphweave-app` 侧仅轻量冒烟（可选）：

- 建 `App`、`apply` 一个 `Edit`、断言 `World` 与渲染实体都更新。

不做 UI/E2E 重测试（P2 再说）。

---

## 11. 依赖（锁定到实施时最新稳定版）

`glyphweave-core`：
- `serde`、`serde_json`、`thiserror`
- `rustc-hash`（更快的 HashMap，可选）

`glyphweave-app`：
- `bevy`（最新稳定，0.15+ 线）
- `bevy_ecs_tilemap`（匹配 Bevy 版本）
- `bevy_egui`（匹配 Bevy 版本）
- `glyphweave-core`（path 依赖）
- 字体资源（等宽，与现 `@fontsource-variable/geist` 对应）

> Bevy 版本迭代快，`bevy_ecs_tilemap` / `bevy_egui` 必须选与所选 Bevy 版本兼容的版本。实施时在 `Cargo.toml` 锁定具体版本号。

---

## 12. 验收标准（Definition of Done）

1. `cargo run -p glyphweave-app` 打开桌面窗口，显示 ASCII 画布。
2. 能加载 `examples/grand-realm-of-aethra.gemap`，三图层 ansi-16 叠加正确渲染。
3. 键盘 `B`/`E` 切换 brush/erase；鼠标在 layer-1 上可画/擦。
4. 滚轮以鼠标为中心缩放；拖拽平移；无明显卡顿。
5. 保存回 `.gemap` v2；round-trip 语义等价测试通过。
6. egui 叠层显示 FPS + tile 坐标。
7. `cargo test -p glyphweave-core` 全绿，含 round-trip 集成测试。
8. `cargo clippy` 无警告（与项目 lint 习惯一致）。

---

## 13. 风险与待解

- **Bevy 版本与生态对齐**：`bevy_ecs_tilemap` / `bevy_egui` 落后于 Bevy 主线是常见痛点。实施第一天先验证三者版本组合可编译，再展开。若不兼容，回退方案：自研 instanced mesh（工作量更大，但完全可控）。
- **`bevy_ecs_tilemap` 是否支持本场景需要的 tile 数量**：P1 有界（≤4096²）应无问题；真·无限需 P3 流式。实施时用 grand-realm + 一个 1024² 随机地图做基准。
- **WASM 单线程**（P5 才涉及，但架构上现在就 Aware）：`core` 保持 `send_sync` 友好、避免不可移植 API；模拟逻辑（P4）设计成 GPU-compute / 单线程友好，不在 P1 引入多线程假设。
- **图集烘焙的字体许可**：选与现仓库一致的 geist 或其它开源等宽字体，放 `bevy/assets/fonts/`。

---

## 14. 后续阶段（仅占位，各出独立 spec）

- **P2**：egui 全套面板（工具栏/调色板/图层树/导出/设置）+ 主题切换 + 多图层编辑。
- **P3**：油漆桶/选择/撤销重做/小地图/快捷键 + 真·无限 chunk 流式。
- **P4**：多线程 ECS 模拟 / 光照 / fog / 寻路（突破性能上限）。
- **P5**：WASM + WebGPU 构建、包体积与首屏加载优化、Web 端文件 I/O 适配。

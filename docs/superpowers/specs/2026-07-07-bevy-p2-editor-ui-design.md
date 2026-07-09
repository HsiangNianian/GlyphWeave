# GlyphWeave Bevy — P2 Editor UI Design

- 日期：2026-07-07
- 范围：P2（编辑器 UI + 主题切换 + 多图层编辑）。建立在 P1 之上。
- 状态：待实现。

---

## 1. 目标与非目标

P1 已交付：桌面 Bevy 应用、`.gemap` 加载/保存、3 图层渲染、brush/erase、缩放/平移、最小 egui 叠层。P1 的“编辑器 UI”只有一个 FPS+信息叠层。

### P2 目标

1. **React 编辑器信息架构对齐**：Bevy 端外壳以 Vite 编辑器为产品基准：左侧窄工具栏、中央全画布、右侧 tabbed inspector。
2. **主题切换**：ansi-16 ↔ cogmind-dark，运行时即时切换（重贴图）。
3. **Tile 调色板面板**：在右侧 `Tiles` tab 中按 9 类分组列出 26 种 tile，点击设置当前笔刷 tile。
4. **图层面板**：在右侧 `Layers` tab 中列出图层，点击切换 active layer；勾选框切换 visible / locked。
5. **多图层编辑**：active layer 可切换；笔刷画在 active layer；visible=false 的图层不渲染；locked 的图层不可编辑。
6. **设置入口**：主题选择器与保存入口放在右侧 `Settings` tab。

### P2 非目标（延后 P3+）

- 油漆桶/选择工具、撤销重做、小地图、预设房间、PNG 导出、tile-size 运行时修改、真·无限流式、WASM。

---

## 2. 主题系统

### 2.1 主题数据

`core::theme` 新模块：`Theme { id, name }` + `tile_colors(kind) -> (fg, bg)`。两个内置主题的颜色来自 `src/constants/themes.ts`（ansi-16 与 cogmind），转成 `[(u8,u8,u8); 2]`。

```rust
pub struct ThemeColors { pub fg: [u8;3], pub bg: [u8;3] }
pub fn palette(theme_id: &str) -> &'static [(ThemeColors; 26)]  // 按 TileKind::ALL 顺序
```

### 2.2 双图集烘焙

`generate_atlas.py` 扩展为输出两张图：`atlas-ansi-16.png` 与 `atlas-cogmind.png`（均 26×24=624×24），共享同一字形顺序（TileKind 索引）。两图都提交。

### 2.3 运行时切换

- `TileAtlas` 资源改为持有 **两个** `Handle<Image>`（ansi-16、cogmind）。
- 新增 `ActiveTheme(pub String)` 资源。
- `set_theme` 系统：遍历所有 `TilemapBundle` 实体，把 `texture: TilemapTexture::Single(...)` 换成当前主题对应的 handle。bevy_ecs_tilemap 重新贴图（tile 纹理索引不变，因为两图顺序一致）。
- 切换通过 egui 按钮触发（写入一条 `SetTheme` 事件或直接改资源 + 标记 dirty）。

---

## 3. Editor shell

Bevy 端不能继续使用 P1/P2 草稿里的 “左调色板 + 右图层” 原型布局。它必须先对齐 React 编辑器的信息架构：

- 左侧 56px 左右的窄工具栏：Brush / Erase 可用，Fill / Select / Undo / Redo 在对应功能落地前可以禁用显示。
- 中央为地图画布，不再有整条顶部状态栏。
- 状态信息以小型浮层显示在画布左上角。
- 右侧 224px 左右 tabbed inspector：Tiles / Presets / Layers / Export / Settings。尚未实现的 tab 禁用或显示明确占位。
- 右下角提供侧栏收起/展开按钮。

这不是要求 egui 像素级复刻 Tailwind/shadcn，但空间结构、默认入口和用户心智必须与网页编辑器一致。

---

## 4. Tile 调色板面板

`app/ui.rs` 在右侧 `Tiles` tab 中按 `TileCategory` 分组列出 26 个 tile。每个 tile 显示其字形 + 名称；点击 → `ActiveBrush.0 = kind`。当前选中高亮。

类别（来自 `src/constants/tiles.ts`）：wall/floor/water/terrain/vegetation/furniture/item/decoration/special。在 `core::tile` 增加 `TileKind::category() -> TileCategory`。

---

## 5. 图层面板

`app/ui.rs` 在右侧 `Layers` tab 中提供：

- 每行：`[vis] [lock] name` + 高亮 active。
- 点 name → `world.active_layer = layer.id`（多图层编辑）。
- 勾 `vis` → 改 `world.layers[i].visible`；触发隐藏/显示对应 tilemap（设 `Visibility` 组件）。
- 勾 `lock` → 改 `world.layers[i].locked`；tool_system 已读取该字段（P1）。

需要一个系统把 `World.layers[i].visible` 同步到 tilemap 实体的 `Visibility`（`sync_layer_visibility`）。

---

## 6. 多图层编辑闭环

- 笔刷：`tool_system` 用 `world.active_layer`（P1 已实现）。
- 渲染同步：`render_sync::sync_edits` 用 `active_index = position of active_layer`（P1 已实现）——切换 active layer 后自动正确。
- 因此“多图层编辑”只需 UI 切换 `active_layer` + 可见性同步。

---

## 7. 数据流增量

```
egui shell ──► ActiveBrush / active_layer / layers[i].visible|locked / ActiveTheme
                │
                ▼
           tool / sync_layer_visibility / set_theme / render_sync
```

新增系统：`sync_layer_visibility`（Update）、`set_theme`（事件/响应式）。

---

## 8. 验收标准（DoD）

1. `cargo run` 打开窗口，加载 Aethra 地图，整体 shell 与 Vite 编辑器信息架构一致：左侧窄工具栏、中央画布、右侧 tabbed inspector。
2. 右侧 `Tiles` tab 出现 **调色板**（26 tile，分类）。
3. 点击调色板某 tile（如 Wall），左键拖拽画出该 tile（不再只画 Floor）。
4. 右侧 `Layers` tab 列出 3 图层；点 “Structures” 切为 active，画图落在 Structures 层。
5. 勾掉某层 `vis` → 该层立即消失；勾回 → 重现。
6. 锁定某层 → 该层不可编辑（左键无反应）。
7. **主题切换**：点 cogmind → 全图立刻变为冷色调；点 ansi-16 → 变回。
8. `cargo test --workspace` 全绿；`cargo clippy --workspace --all-targets -- -D warnings` 干净。
9. 截图验证（grim）。

---

## 9. 风险

- bevy_ecs_tilemap 运行时更换 `TilemapTexture` 是否触发重贴图：需在实现时验证；若不自动重贴，回退为 despawn+respawn tilemaps。
- egui 面板会占用屏幕空间，需确保画布交互（paint）不被面板吞掉（`egui_wants_any_pointer_input` 门控已存在）。

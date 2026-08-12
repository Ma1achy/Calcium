# Component index

| | Component | Layer | Package | Spec |
|---|---|---|---|---|
| C01 | Terminal lifecycle | L0 terminal | kit | [spec](components/C01_terminal_lifecycle.md) |
| C02 | Capability detection | L0 terminal | kit | [spec](components/C02_capability_detection.md) |
| C03 | Frame scheduler | L0 terminal | kit | [spec](components/C03_frame_scheduler.md) |
| C04 | View model | L0 data | kit | [spec](components/C04_view_model.md) |
| C05 | Tool manifest | L0 data | kit + app | [spec](components/C05_tool_manifest.md) |
| C06 | Transport | L0 data | kit | [spec](components/C06_transport.md) |
| C07 | Adapter registry | L0 data | kit + app | [spec](components/C07_adapter_registry.md) |
| C08 | Fixture world | L0 data + app | kit + app | [spec](components/C08_fixture_world.md) |
| C09 | Block library | L1 | kit | [spec](components/C09_block_library.md) |
| C10 | Theme resolution | L1 | kit + app | [spec](components/C10_theme_resolution.md) |
| C11 | Table engine | L1 | kit | [spec](components/C11_table_engine.md) |
| C12 | Plot renderer | L1 | kit | [spec](components/C12_plot_renderer.md) |
| C13 | Transcript store | L2 | kit | [spec](components/C13_transcript_store.md) |
| C14 | Viewport | L2 | kit | [spec](components/C14_viewport.md) |
| C15 | Overlay manager | L2 | kit | [spec](components/C15_overlay_manager.md) |
| C16 | Input router | L3 | kit | [spec](components/C16_input_router.md) |
| C17 | Line editor | L3 | kit | [spec](components/C17_line_editor.md) |
| C18 | Command parser | L3 | kit + app | [spec](components/C18_command_parser.md) |
| C19 | Completion engine | L3 | kit + app | [spec](components/C19_completion_engine.md) |
| C20 | History store | L3 | kit | [spec](components/C20_history_store.md) |
| C21 | Process runner | L0 data | kit | [spec](components/C21_process_runner.md) |
| C22 | Composition root | L4 | kit | [spec](components/C22_composition_root.md) |
| C23 | Execution pipeline | L4 | kit | [spec](components/C23_execution_pipeline.md) |
| C24 | Public API | L4 | kit | [spec](components/C24_public_api.md) |
| C25 | Patch renderer | L1 | kit | [spec](components/C25_patch_renderer.md) |
| C26 | Navigation | L3 | kit | [spec](components/C26_navigation.md) — **design only, unbuilt** |

`kit + app` means the framework owns the mechanism and a consuming app supplies the
content — the five extension hooks of A02 §6.

## Source layout

| Path | Components |
|---|---|
| `src/terminal/` | C01 C02 C03 |
| `src/data/` | C04 C05 C06 C07 C08 C21 |
| `src/presentation/` | C09 C10 C11 C12 C25 |
| `src/viewport/` | C13 C14 C15 |
| `src/interaction/` | C16 C17 C18 C19 C20 · C26 (`navigation/`, unbuilt) |
| `src/shell/` | C22 C23 |
| `src/index.ts` | C24 |

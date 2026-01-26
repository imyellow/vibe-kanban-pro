# Claude Code 环境变量覆盖问题解决方案

## 问题描述

在 vibe-kanban 的 `/settings/agents` 页面配置了自定义 executor profile（如 GLM），并设置了环境变量：
- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_AUTH_TOKEN`
- `API_TIMEOUT_MS`

但启动 agent 任务后，这些环境变量没有生效，claude-code 仍然使用默认的 Anthropic API。

## 根因分析

### Claude Code 设置源优先级

Claude Code 有三种设置源，按优先级从低到高：

| 设置源 | 文件路径 | 作用范围 |
|--------|----------|----------|
| **user** | `~/.claude/settings.json` | 全局，所有项目 |
| **project** | `<项目>/.claude/settings.json` | 项目级共享 |
| **local** | `<项目>/.claude/settings.local.json` | 项目级本地 |

### 问题原因

1. vibe-kanban 通过 `command.env(key, value)` 将 profile 的环境变量注入到 claude-code 子进程
2. 但 claude-code 内部会读取 `~/.claude/settings.json` 中的 `env` 配置
3. **settings.json 中的 env 优先级高于进程环境变量**
4. 如果用户在 `~/.claude/settings.json` 中配置了 `ANTHROPIC_BASE_URL`，会覆盖 profile 传入的值

示例 `~/.claude/settings.json`：
```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "xxx",
    "ANTHROPIC_BASE_URL": "https://us.imds.ai/api"
  }
}
```

## 解决方案

### 方案概述

当 profile 配置了 env 时，使用 claude-code CLI 参数来：
1. 跳过 user 级设置（`--setting-sources project`）
2. 通过 `--settings` 参数传入 profile 的 env 配置

### 代码修改

修改文件：`crates/executors/src/executors/claude.rs`

在 `build_command_builder` 方法中添加：

```rust
// If profile has env configuration, skip user-level settings and pass env via --settings
// This ensures profile env vars take precedence over ~/.claude/settings.json
if let Some(ref profile_env) = self.cmd.env {
    if !profile_env.is_empty() {
        // Skip user-level settings (~/.claude/settings.json) to avoid env conflicts
        builder = builder.extend_params(["--setting-sources", "project"]);

        let settings_json = serde_json::json!({
            "env": profile_env
        });
        let settings_str = settings_json.to_string();
        tracing::info!(
            "build_command_builder: adding --setting-sources=project and --settings with env: {}",
            settings_str
        );
        builder = builder.extend_params(["--settings", &settings_str]);
    }
}
```

### 相关 CLI 参数

| 参数 | 说明 |
|------|------|
| `--setting-sources <sources>` | 指定加载的设置源，逗号分隔（user, project, local） |
| `--settings <file-or-json>` | 加载额外的 settings JSON 文件或 JSON 字符串 |

### 行为说明

- **profile 有 env 配置**：
  - 添加 `--setting-sources project`（跳过 user 级设置）
  - 添加 `--settings '{"env": {...}}'`（传入 profile env）

- **profile 无 env 配置**：
  - 保持默认行为，正常加载所有设置源

## 参考资料

- [Claude Code Settings 官方文档](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/settings)
- [GitHub Issue: Environment Variables No Longer Override settings.json](https://github.com/anthropics/claude-code/issues/1202)

## 更新记录

- 2026-01-26: 初始版本，解决 profile env 被 user settings.json 覆盖的问题

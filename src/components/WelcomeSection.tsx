/**
 * 文件功能：欢迎区组件，展示品牌标题与快捷问题卡片。
 * 设计思路：
 * 1. 欢迎区作为“空会话态”入口，与聊天面板分离，状态切换更直观。
 * 2. 预置问题通过 props 回调上抛，组件本身保持无业务副作用。
 * 3. 图标和问题文案解耦，便于后续替换视觉资产或做国际化。
 */

import { QUICK_PROMPTS } from "../constants";

interface WelcomeSectionProps {
  hidden: boolean;
  disabled: boolean;
  onPrompt: (prompt: string) => void;
}

const ICONS = ["✎", "✦", "◉", "⌘"];
const ICON_CLASSES = ["icon-blue", "icon-green", "icon-yellow", "icon-purple"];

export function WelcomeSection({
  hidden,
  disabled,
  onPrompt,
}: WelcomeSectionProps) {
  return (
    // hidden 时仍保留组件结构，依赖样式控制显示，便于动效过渡。
    <section className={`welcome ${hidden ? "hidden" : ""}`}>
      <h1 className="welcome-title">
        <span className="title-gradient">嗨，我是灵犀</span>
      </h1>
      <p className="welcome-subtitle">我能帮你什么吗？</p>

      <div className="quick-cards">
        {/* 预置问题映射为可点击卡片，一键触发发送流程 */}
        {QUICK_PROMPTS.map((prompt, index) => (
          <button
            key={prompt}
            className="quick-card"
            type="button"
            onClick={() => onPrompt(prompt)}
            disabled={disabled}
          >
            <span className="card-text">{prompt}</span>
            <span className={`card-icon ${ICON_CLASSES[index]}`}>
              {ICONS[index]}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

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

const ICONS = [
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2.5l1.73 5.33 5.6-1.13-3.86 4.2 3.86 4.2-5.6-1.13L12 19.3l-1.73-5.33-5.6 1.13 3.86-4.2-3.86-4.2 5.6 1.13L12 2.5z" />
  </svg>,
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5.5 4.75A2.75 2.75 0 0 1 8.25 2h10.5v16.5H8.25a2.75 2.75 0 0 0-2.75 2.75V4.75zM8.25 4A.75.75 0 0 0 7.5 4.75v12.11c.25-.07.5-.11.75-.11h8.5V4h-8.5z" />
    <path d="M5.25 2A1.25 1.25 0 0 0 4 3.25v18.5h2V3.25A1.25 1.25 0 0 0 5.25 2z" />
  </svg>,
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M8.5 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm7 0a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7zM2.75 20.5a5.75 5.75 0 0 1 11.5 0v.5H2.75v-.5zm11.6.5a7.2 7.2 0 0 0-1.42-4.3 5.25 5.25 0 0 1 8.32 4.25V21h-6.9z" />
  </svg>,
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3.25 3.75 8.1v7.8L12 20.75l8.25-4.85V8.1L12 3.25zm0 2.32 5.96 3.5L12 12.58l-5.96-3.5L12 5.57zM5.75 10.82 11 13.9v4.25l-5.25-3.08v-4.25zm7.25 7.33V13.9l5.25-3.08v4.25L13 18.15z" />
  </svg>,
];
const ICON_CLASSES = ["icon-blue", "icon-green", "icon-yellow", "icon-purple"];

export function WelcomeSection({
  hidden, // 是否隐藏组件
  disabled, // 是否禁用交互（流式中禁用，防止重复发送）
  onPrompt, // 回调预置问题点击事件
}: WelcomeSectionProps) {
  return (
    // hidden 时仍保留组件结构，依赖样式控制显示，便于动效过渡。
    <section className={`welcome ${hidden ? "hidden" : ""}`}>
      <h1 className="welcome-title">
        <span className="title-gradient">嗨，我是你的AI助手</span>
      </h1>                                                     
      <p className="welcome-subtitle">我能帮你做些什么？</p>

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

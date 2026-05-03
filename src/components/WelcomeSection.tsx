import { QUICK_PROMPTS } from "../constants";

interface WelcomeSectionProps {
  hidden: boolean;
  disabled: boolean;
  onPrompt: (prompt: string) => void;
}

const ICONS = ["启", "学", "聚", "玩"];
const ICON_CLASSES = ["icon-blue", "icon-green", "icon-yellow", "icon-purple"];

export function WelcomeSection({
  hidden,
  disabled,
  onPrompt,
}: WelcomeSectionProps) {
  return (
    <section className={`welcome ${hidden ? "hidden" : ""}`}>
      <h1 className="welcome-title">
        <span className="title-gradient">嗨，我是灵犀</span>
      </h1>
      <p className="welcome-subtitle">我能帮你做些什么？</p>

      <div className="quick-cards">
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

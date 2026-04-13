/**
 * 文件功能：应用入口文件，负责挂载 React 根组件和全局样式。
 * 设计思路：
 * 1. 入口层保持最薄，不放业务逻辑，避免启动流程与业务耦合。
 * 2. 通过 StrictMode 在开发态尽早暴露副作用问题，降低后续维护成本。
 * 3. 全局样式在入口统一导入，保证主题变量和基础布局先于组件渲染生效。
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";
import { AppRouter } from "./route";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>,
);

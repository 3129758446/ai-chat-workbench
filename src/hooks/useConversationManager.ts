import { useNavigate } from "react-router-dom";
import { useChatStore } from "../store";

/**
 * Hook 功能：会话生命周期管理中心
 * 设计思路：
 * 1. 封装路由跳转与 Store 动作的联动，使组件层只需调用简单的方法。
 * 2. 处理“删除当前会话”后的回退逻辑，统一回到首页，避免自动切到其他会话造成上下文跳变。
 */
export function useConversationManager(routeConversationId: string | null) {
  const navigate = useNavigate();
  const {
    deleteConversation, // 删除会话
    ensureConversation, // 确保会话存在
    switchConversation, // 切换会话
  } = useChatStore();

  /**
   * 新建会话：清空当前状态并返回首页
   */
  const handleCreateConversation = () => {
    navigate("/");
  };

  /**
   * 选择会话：跳转到对应的路由
   */
  const handleSelectConversation = (conversationId: string) => {
    navigate(`/chat/${conversationId}`);
  };

  /**
   * 删除会话：包含复杂的逻辑判断
   * @param conversationId 要删除的 ID
   * @param stopStreaming 外部传入的停止流式回调，确保删除前停止请求
   */
  const handleDeleteConversation = (
    conversationId: string,
    stopStreaming?: () => void, // 停止流式回调
  ) => {
    const isCurrent = routeConversationId === conversationId;

    // 1. 如果删除的是当前正在生成的会话，先停止流式
    if (isCurrent && stopStreaming) {
      stopStreaming();
    }

    // 2. 执行 Store 中的删除动作
    deleteConversation(conversationId);

    // 3. 路由重定向逻辑
    if (!isCurrent) return;

    // 删除当前会话后统一回首页，避免自动切换到其他会话影响用户预期。
    navigate("/", { replace: true });
  };

  return {
    handleCreateConversation,
    handleSelectConversation,
    handleDeleteConversation,
    ensureConversation,
    switchConversation,
  };
}

 import { useNavigate } from "react-router-dom";
import { useChatStore } from "../store";

/**
 * Hook 功能：会话生命周期管理中心
 * 设计思路：
 * 1. 封装路由跳转与 Store 动作的联动，使组件层只需调用简单的方法。
 * 2. 处理“删除当前会话”后的回退逻辑（跳转到首页或自动切换到下一个会话）。
 */
export function useConversationManager(routeConversationId: string | null) {
  const navigate = useNavigate();
  const {
    createConversation, // 创建会话
    deleteConversation, // 删除会话
    ensureConversation, // 确保会话存在
    switchConversation,  // 切换会话
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

    const remainingIds = useChatStore.getState().orderedConversationIds; // 获取剩余会话 IDs
    
    if (remainingIds.length) {
      // 如果还有剩余会话，跳转到第一个
      navigate(`/chat/${remainingIds[0]}`, { replace: true });
    } else {
      // 如果全删了，创建一个新会话并跳转到首页
      const nextId = createConversation();
      navigate(`/chat/${nextId}`, { replace: true });
    }
  };

  return {
    handleCreateConversation,
    handleSelectConversation,
    handleDeleteConversation,
    ensureConversation,
    switchConversation,
  };
}

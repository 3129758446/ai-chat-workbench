import { createBrowserRouter, Navigate } from "react-router-dom";
import App from "../App";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App mode="home" />,
  },
  {
    path: "/chat/:conversationId",
    element: <App mode="chat" />,
  },
  {
    path: "/chat",
    element: <Navigate to="/" replace />,
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);

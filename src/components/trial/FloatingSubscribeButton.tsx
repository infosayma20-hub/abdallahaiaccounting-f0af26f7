import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

const FloatingSubscribeButton = () => {
  const navigate = useNavigate();

  return (
    <motion.button
      onClick={() => navigate("/pricing?reason=trial_expired")}
      animate={{ y: [0, -6, 0] }}
      transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
      className="fixed z-[1000] cursor-pointer"
      style={{
        bottom: 24,
        left: 24,
        background: "linear-gradient(135deg, #E8A020, #F45E0C)",
        color: "white",
        padding: "12px 20px",
        borderRadius: 50,
        fontFamily: "Tajawal",
        fontWeight: 700,
        fontSize: 14,
        border: "none",
        boxShadow: "0 8px 24px rgba(232,160,32,0.5)",
      }}
      dir="rtl"
    >
      🚀 اشترك الآن
    </motion.button>
  );
};

export default FloatingSubscribeButton;

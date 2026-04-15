import { useNavigate } from "react-router-dom";

const NoorSupportWidget = () => {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate("/support/chat")}
      className="fixed bottom-6 left-4 z-[60] w-12 h-12 rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all duration-200 overflow-hidden border-2 border-primary/30"
      style={{ boxShadow: "0 4px 20px hsl(var(--primary) / 0.35)" }}
      title="نور — الدعم الفني"
    >
      <img
        src="/logos/amwali-mark-white-bg.png"
        alt="نور — دعم أموالي"
        className="w-full h-full object-cover"
      />
    </button>
  );
};

export default NoorSupportWidget;

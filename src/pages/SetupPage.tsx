import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import SetupWizard from "@/components/SetupWizard";
import LoadingScreen from "@/components/LoadingScreen";

const SetupPage = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) return <LoadingScreen />;
  if (!user) return null;

  return (
    <SetupWizard
      userId={user.id}
      onComplete={() => navigate("/apps", { replace: true })}
    />
  );
};

export default SetupPage;

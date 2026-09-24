import GeneralManagerCelebration from "@/components/pos/GeneralManagerCelebration";
import { MALAKY_OWNER_ID } from "@/lib/malakyAccess";

export default function BirthdayPreview() {
  return (
    <GeneralManagerCelebration
      authUserId="mosab-general-manager-birthday-preview"
      dataOwnerId={MALAKY_OWNER_ID}
      verifyPosAccount={false}
    />
  );
}

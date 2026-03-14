import { useCompanySettings } from "@/hooks/useCompanySettings";

export function useDocumentPermissions() {
  const { settings } = useCompanySettings();

  const canEditPosted = settings.can_edit_posted ?? false;
  const canDeletePosted = settings.can_delete_posted ?? false;

  const canEdit = (doc: { status?: string }) => {
    if (!doc.status || doc.status === "draft" || doc.status === "مسودة") return true;
    return canEditPosted;
  };

  const canDelete = (doc: { status?: string }) => {
    if (!doc.status || doc.status === "draft" || doc.status === "مسودة") return true;
    return canDeletePosted;
  };

  return { canEdit, canDelete, canEditPosted, canDeletePosted };
}

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CostCenter,
  COST_CENTER_TYPES,
  useCostCenters,
  useCostCenterMutations,
} from "@/hooks/useCostCenters";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing?: CostCenter | null;
}

/** Dialog لإنشاء/تعديل مركز تكلفة. منع الكود المكرر، حقول كاملة، RTL. */
export default function CostCenterFormDialog({ open, onOpenChange, editing }: Props) {
  const { user } = useAuth();
  const { data: allCenters = [] } = useCostCenters({ includeInactive: true });
  const { upsert } = useCostCenterMutations();

  const branchesQ = useQuery({
    queryKey: ["branches", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("branches")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
    enabled: !!user,
  });
  const employeesQ = useQuery({
    queryKey: ["employees-min", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("employees")
        .select("id, full_name")
        .order("full_name");
      return data || [];
    },
    enabled: !!user,
  });

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [centerType, setCenterType] = useState<string>("department");
  const [parentId, setParentId] = useState<string>("__none__");
  const [branchId, setBranchId] = useState<string>("__none__");
  const [managerId, setManagerId] = useState<string>("__none__");
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setCode(editing.code || "");
      setName(editing.name || "");
      setNameAr(editing.name_ar || "");
      setCenterType(editing.center_type || "department");
      setParentId(editing.parent_id || "__none__");
      setBranchId(editing.branch_id || "__none__");
      setManagerId(editing.manager_employee_id || "__none__");
      setIsActive(editing.is_active);
      setNotes(editing.notes || "");
    } else {
      setCode("");
      setName("");
      setNameAr("");
      setCenterType("department");
      setParentId("__none__");
      setBranchId("__none__");
      setManagerId("__none__");
      setIsActive(true);
      setNotes("");
    }
  }, [open, editing]);

  // Prevent picking self or descendant as parent
  const validParents = useMemo(() => {
    if (!editing) return allCenters;
    const blocked = new Set<string>([editing.id]);
    let added = true;
    while (added) {
      added = false;
      for (const c of allCenters) {
        if (c.parent_id && blocked.has(c.parent_id) && !blocked.has(c.id)) {
          blocked.add(c.id);
          added = true;
        }
      }
    }
    return allCenters.filter((c) => !blocked.has(c.id));
  }, [allCenters, editing]);

  const handleSave = async () => {
    if (!code.trim()) return toast.error("الكود مطلوب");
    if (!name.trim()) return toast.error("الاسم مطلوب");
    setSaving(true);
    try {
      await upsert.mutateAsync({
        id: editing?.id,
        code: code.trim(),
        name: name.trim(),
        name_ar: nameAr || null,
        center_type: centerType,
        parent_id: parentId === "__none__" ? null : parentId,
        branch_id: branchId === "__none__" ? null : branchId,
        manager_employee_id: managerId === "__none__" ? null : managerId,
        is_active: isActive,
        notes: notes || null,
      });
      toast.success(editing ? "تم تحديث مركز التكلفة" : "تم إنشاء مركز التكلفة");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">
            {editing ? "تعديل مركز تكلفة" : "مركز تكلفة جديد"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs mb-1.5 block">الكود *</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="مثال: BR-01" />
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">النوع *</Label>
            <Select value={centerType} onValueChange={setCenterType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {COST_CENTER_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">الاسم *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم المركز" />
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">الاسم بالعربي</Label>
            <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder="اختياري" />
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">مركز الأب</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-[280px]">
                <SelectItem value="__none__">— بدون أب —</SelectItem>
                {validParents.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="font-mono text-[10px] bg-muted px-1 rounded mr-1">{c.code}</span>
                    {c.name_ar || c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">الفرع</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— بدون فرع —</SelectItem>
                {(branchesQ.data || []).map((b: any) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">المسؤول</Label>
            <Select value={managerId} onValueChange={setManagerId}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent className="max-h-[280px]">
                <SelectItem value="__none__">— بدون مسؤول —</SelectItem>
                {(employeesQ.data || []).map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between border rounded-md p-3">
            <Label className="text-xs">الحالة</Label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{isActive ? "نشط" : "موقوف"}</span>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>

          <div className="md:col-span-2">
            <Label className="text-xs mb-1.5 block">ملاحظات</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="اختياري..." />
          </div>
        </div>

        <DialogFooter className="flex-row-reverse gap-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
            {editing ? "حفظ التعديلات" : "إنشاء"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
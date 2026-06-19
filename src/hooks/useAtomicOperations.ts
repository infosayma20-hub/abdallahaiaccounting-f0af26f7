import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface InvoiceItemInput {
  product_id?: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  description?: string | null;
}

interface InvoiceParams {
  contactId?: string;
  contactName: string;
  amount: number;
  description?: string;
  paymentMethod?: string;
  currency?: string;
  items?: InvoiceItemInput[];
  invoiceDate?: string;
  paidAmount?: number;
  discountAmount?: number;
  taxAmount?: number;
  exchangeRate?: number;
  source?: string;
}

interface ReceiptPaymentParams {
  contactId?: string;
  contactName: string;
  amount: number;
  paymentMethod?: string;
  description?: string;
  currency?: string;
}

interface AtomicResult {
  success: boolean;
  transactionId?: string;
  duplicate?: boolean;
  error?: string;
}

export function useAtomicOperations() {
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const generateIdempotencyKey = (prefix: string) => {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  };

  const createInvoice = async (params: InvoiceParams): Promise<AtomicResult> => {
    if (!user) return { success: false, error: "غير مسجل الدخول" };
    setLoading(true);
    try {
      // Use the new fully-atomic RPC: invoice + items + stock + journal in one transaction
      const { data, error } = await supabase.rpc('create_sale_invoice_atomic', {
        p_user_id: user.id,
        p_contact_id: params.contactId || null,
        p_contact_name: params.contactName,
        p_invoice_date: params.invoiceDate || new Date().toISOString().split('T')[0],
        p_payment_method: params.paymentMethod || 'آجل',
        p_currency: params.currency || 'شيكل',
        p_exchange_rate: params.exchangeRate || 1,
        p_subtotal: params.amount,
        p_discount_amount: params.discountAmount || 0,
        p_tax_amount: params.taxAmount || 0,
        p_total_amount: params.amount,
        p_paid_amount: params.paidAmount ?? (params.paymentMethod === 'نقدي' || params.paymentMethod === 'cash' ? params.amount : 0),
        p_notes: params.description || null,
        p_items: (params.items || []) as any,
        p_idempotency_key: generateIdempotencyKey('INV'),
        p_source: params.source || 'manual',
      });

      if (error) throw error;
      const result = data as unknown as AtomicResult & { stock_alerts_created?: number };

      if (result.success) {
        toast({
          title: result.duplicate ? "العملية موجودة مسبقاً ✅" : "تم إنشاء الفاتورة والقيد ✅",
          description: result.stock_alerts_created
            ? `${params.contactName} - تنبيه: ${result.stock_alerts_created} منتج بمخزون سالب`
            : `مبلغ ${params.amount} - ${params.contactName}`,
          variant: result.stock_alerts_created ? "default" : "default",
        });
      }
      return result;
    } catch (err: any) {
      toast({ title: "خطأ في إنشاء الفاتورة", description: err.message, variant: "destructive" });
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  const createPurchase = async (params: InvoiceParams): Promise<AtomicResult> => {
    if (!user) return { success: false, error: "غير مسجل الدخول" };
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('create_purchase_with_entry', {
        p_user_id: user.id,
        p_contact_id: params.contactId || null,
        p_contact_name: params.contactName,
        p_amount: params.amount,
        p_description: params.description || null,
        p_payment_method: params.paymentMethod || 'آجل',
        p_currency: params.currency || 'شيكل',
        p_idempotency_key: generateIdempotencyKey('PUR'),
      });

      if (error) throw error;
      const result = data as unknown as AtomicResult;

      if (result.success) {
        toast({
          title: result.duplicate ? "العملية موجودة مسبقاً ✅" : "تم إنشاء فاتورة الشراء والقيد ✅",
          description: `مبلغ ${params.amount} - ${params.contactName}`,
        });
      }
      return result;
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  const createReceipt = async (params: ReceiptPaymentParams): Promise<AtomicResult> => {
    if (!user) return { success: false, error: "غير مسجل الدخول" };
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('create_receipt_with_entry', {
        p_user_id: user.id,
        p_contact_id: params.contactId || null,
        p_contact_name: params.contactName,
        p_amount: params.amount,
        p_payment_method: params.paymentMethod || 'نقدي',
        p_description: params.description || null,
        p_currency: params.currency || 'شيكل',
        p_idempotency_key: generateIdempotencyKey('RCV'),
      });

      if (error) throw error;
      const result = data as unknown as AtomicResult;

      if (result.success) {
        toast({
          title: "تم إنشاء سند القبض ✅",
          description: `مبلغ ${params.amount} من ${params.contactName}`,
        });
      }
      return result;
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  const createPayment = async (params: ReceiptPaymentParams): Promise<AtomicResult> => {
    if (!user) return { success: false, error: "غير مسجل الدخول" };
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('create_payment_with_entry', {
        p_user_id: user.id,
        p_contact_id: params.contactId || null,
        p_contact_name: params.contactName,
        p_amount: params.amount,
        p_payment_method: params.paymentMethod || 'نقدي',
        p_description: params.description || null,
        p_currency: params.currency || 'شيكل',
        p_idempotency_key: generateIdempotencyKey('PAY'),
      });

      if (error) throw error;
      const result = data as unknown as AtomicResult;

      if (result.success) {
        toast({
          title: "تم إنشاء سند الصرف ✅",
          description: `مبلغ ${params.amount} إلى ${params.contactName}`,
        });
      }
      return result;
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  const collectCheque = async (chequeId: string): Promise<boolean> => {
    if (!user) return false;
    setLoading(true);
    try {
      // Update cheque status only - journal entry is created by ChequesPage action handler
      const { error } = await supabase.from('cheques')
        .update({ status: 'محصل' as any })
        .eq('id', chequeId)
        .eq('user_id', user.id);
      if (error) throw error;

      // Record status history
      await supabase.from('cheque_status_history').insert({
        cheque_id: chequeId,
        user_id: user.id,
        from_status: 'مودع' as any,
        to_status: 'محصل' as any,
      });

      toast({ title: "تم تحصيل الشيك وإنشاء القيد البنكي ✅" });
      return true;
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const paySalary = async (payrollId: string, paymentMethod: string = 'نقدي'): Promise<boolean> => {
    if (!user) return false;
    setLoading(true);
    try {
      // Update payroll as paid - trigger auto-creates journal entry
      const { error } = await supabase.from('employee_payroll')
        .update({ is_paid: true, paid_date: new Date().toISOString().split('T')[0] })
        .eq('id', payrollId)
        .eq('user_id', user.id);
      if (error) throw error;

      toast({ title: "تم صرف الراتب وإنشاء قيد المصروف ✅" });
      return true;
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    createInvoice,
    createPurchase,
    createReceipt,
    createPayment,
    collectCheque,
    paySalary,
  };
}

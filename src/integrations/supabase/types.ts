export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      cheque_status_history: {
        Row: {
          cheque_id: string
          created_at: string
          from_status: Database["public"]["Enums"]["cheque_status"] | null
          id: string
          reason: string | null
          to_status: Database["public"]["Enums"]["cheque_status"]
          user_id: string
        }
        Insert: {
          cheque_id: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["cheque_status"] | null
          id?: string
          reason?: string | null
          to_status: Database["public"]["Enums"]["cheque_status"]
          user_id: string
        }
        Update: {
          cheque_id?: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["cheque_status"] | null
          id?: string
          reason?: string | null
          to_status?: Database["public"]["Enums"]["cheque_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cheque_status_history_cheque_id_fkey"
            columns: ["cheque_id"]
            isOneToOne: false
            referencedRelation: "cheques"
            referencedColumns: ["id"]
          },
        ]
      }
      cheques: {
        Row: {
          amount: number
          bank_name: string | null
          cheque_date: string
          cheque_number: string | null
          cheque_type: Database["public"]["Enums"]["cheque_type"]
          created_at: string
          currency: string
          id: string
          image_url: string | null
          linked_account: string | null
          notes: string | null
          party_name: string
          party_type: string
          status: Database["public"]["Enums"]["cheque_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          bank_name?: string | null
          cheque_date: string
          cheque_number?: string | null
          cheque_type: Database["public"]["Enums"]["cheque_type"]
          created_at?: string
          currency?: string
          id?: string
          image_url?: string | null
          linked_account?: string | null
          notes?: string | null
          party_name: string
          party_type?: string
          status?: Database["public"]["Enums"]["cheque_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          bank_name?: string | null
          cheque_date?: string
          cheque_number?: string | null
          cheque_type?: Database["public"]["Enums"]["cheque_type"]
          created_at?: string
          currency?: string
          id?: string
          image_url?: string | null
          linked_account?: string | null
          notes?: string | null
          party_name?: string
          party_type?: string
          status?: Database["public"]["Enums"]["cheque_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      commissions: {
        Row: {
          base_amount: number
          commission_amount: number
          commission_rate: number
          commission_type: string
          created_at: string
          id: string
          is_paid: boolean
          linked_account_name: string | null
          notes: string | null
          paid_date: string | null
          reference_description: string | null
          reference_id: string | null
          reference_type: string
          representative_id: string
          user_id: string
        }
        Insert: {
          base_amount?: number
          commission_amount?: number
          commission_rate?: number
          commission_type: string
          created_at?: string
          id?: string
          is_paid?: boolean
          linked_account_name?: string | null
          notes?: string | null
          paid_date?: string | null
          reference_description?: string | null
          reference_id?: string | null
          reference_type: string
          representative_id: string
          user_id: string
        }
        Update: {
          base_amount?: number
          commission_amount?: number
          commission_rate?: number
          commission_type?: string
          created_at?: string
          id?: string
          is_paid?: boolean
          linked_account_name?: string | null
          notes?: string | null
          paid_date?: string | null
          reference_description?: string | null
          reference_id?: string | null
          reference_type?: string
          representative_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_representative_id_fkey"
            columns: ["representative_id"]
            isOneToOne: false
            referencedRelation: "sales_representatives"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_allowances: {
        Row: {
          allowance_name: string
          allowance_type: string
          amount: number
          created_at: string
          employee_id: string
          id: string
          is_active: boolean
          notes: string | null
          percentage: number | null
          user_id: string
        }
        Insert: {
          allowance_name: string
          allowance_type?: string
          amount?: number
          created_at?: string
          employee_id: string
          id?: string
          is_active?: boolean
          notes?: string | null
          percentage?: number | null
          user_id: string
        }
        Update: {
          allowance_name?: string
          allowance_type?: string
          amount?: number
          created_at?: string
          employee_id?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          percentage?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_allowances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_attendance: {
        Row: {
          attendance_date: string
          check_in: string | null
          check_out: string | null
          created_at: string
          employee_id: string
          hours_worked: number | null
          id: string
          notes: string | null
          overtime_hours: number | null
          status: string
          user_id: string
        }
        Insert: {
          attendance_date?: string
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          employee_id: string
          hours_worked?: number | null
          id?: string
          notes?: string | null
          overtime_hours?: number | null
          status?: string
          user_id: string
        }
        Update: {
          attendance_date?: string
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          employee_id?: string
          hours_worked?: number | null
          id?: string
          notes?: string | null
          overtime_hours?: number | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_deductions: {
        Row: {
          amount: number
          created_at: string
          deduction_date: string
          deduction_type: string
          description: string | null
          employee_id: string
          id: string
          is_repaid: boolean
          notes: string | null
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          deduction_date?: string
          deduction_type: string
          description?: string | null
          employee_id: string
          id?: string
          is_repaid?: boolean
          notes?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          deduction_date?: string
          deduction_type?: string
          description?: string | null
          employee_id?: string
          id?: string
          is_repaid?: boolean
          notes?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_deductions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_leaves: {
        Row: {
          created_at: string
          days_count: number
          employee_id: string
          end_date: string
          id: string
          leave_type: string
          notes: string | null
          start_date: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          days_count?: number
          employee_id: string
          end_date: string
          id?: string
          leave_type: string
          notes?: string | null
          start_date: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          days_count?: number
          employee_id?: string
          end_date?: string
          id?: string
          leave_type?: string
          notes?: string | null
          start_date?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_leaves_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_payroll: {
        Row: {
          base_salary: number
          created_at: string
          employee_id: string
          id: string
          is_paid: boolean
          net_salary: number
          notes: string | null
          paid_date: string | null
          period_month: number
          period_year: number
          total_allowances: number
          total_deductions: number
          total_overtime: number
          user_id: string
        }
        Insert: {
          base_salary?: number
          created_at?: string
          employee_id: string
          id?: string
          is_paid?: boolean
          net_salary?: number
          notes?: string | null
          paid_date?: string | null
          period_month: number
          period_year: number
          total_allowances?: number
          total_deductions?: number
          total_overtime?: number
          user_id: string
        }
        Update: {
          base_salary?: number
          created_at?: string
          employee_id?: string
          id?: string
          is_paid?: boolean
          net_salary?: number
          notes?: string | null
          paid_date?: string | null
          period_month?: number
          period_year?: number
          total_allowances?: number
          total_deductions?: number
          total_overtime?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_payroll_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          address: string | null
          annual_leave_days: number
          bank_account: string | null
          bank_name: string | null
          base_salary: number
          created_at: string
          department: string | null
          email: string | null
          emergency_contact: string | null
          emergency_phone: string | null
          end_date: string | null
          full_name: string
          hourly_rate: number
          id: string
          id_number: string | null
          is_active: boolean
          job_title: string | null
          notes: string | null
          phone: string | null
          photo_url: string | null
          position: string | null
          salary_type: string
          sick_leave_days: number
          start_date: string
          updated_at: string
          user_id: string
          work_days_per_week: number
          work_hours_per_day: number
        }
        Insert: {
          address?: string | null
          annual_leave_days?: number
          bank_account?: string | null
          bank_name?: string | null
          base_salary?: number
          created_at?: string
          department?: string | null
          email?: string | null
          emergency_contact?: string | null
          emergency_phone?: string | null
          end_date?: string | null
          full_name: string
          hourly_rate?: number
          id?: string
          id_number?: string | null
          is_active?: boolean
          job_title?: string | null
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          position?: string | null
          salary_type?: string
          sick_leave_days?: number
          start_date?: string
          updated_at?: string
          user_id: string
          work_days_per_week?: number
          work_hours_per_day?: number
        }
        Update: {
          address?: string | null
          annual_leave_days?: number
          bank_account?: string | null
          bank_name?: string | null
          base_salary?: number
          created_at?: string
          department?: string | null
          email?: string | null
          emergency_contact?: string | null
          emergency_phone?: string | null
          end_date?: string | null
          full_name?: string
          hourly_rate?: number
          id?: string
          id_number?: string | null
          is_active?: boolean
          job_title?: string | null
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          position?: string | null
          salary_type?: string
          sick_leave_days?: number
          start_date?: string
          updated_at?: string
          user_id?: string
          work_days_per_week?: number
          work_hours_per_day?: number
        }
        Relationships: []
      }
      invoice_receipt_matching: {
        Row: {
          created_at: string
          id: string
          invoice_amount: number
          invoice_id: string
          invoice_number: string | null
          match_date: string
          matched_amount: number
          notes: string | null
          receipt_amount: number
          receipt_id: string
          receipt_number: string | null
          representative_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_amount?: number
          invoice_id: string
          invoice_number?: string | null
          match_date?: string
          matched_amount?: number
          notes?: string | null
          receipt_amount?: number
          receipt_id: string
          receipt_number?: string | null
          representative_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invoice_amount?: number
          invoice_id?: string
          invoice_number?: string | null
          match_date?: string
          matched_amount?: number
          notes?: string | null
          receipt_amount?: number
          receipt_id?: string
          receipt_number?: string | null
          representative_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_receipt_matching_representative_id_fkey"
            columns: ["representative_id"]
            isOneToOne: false
            referencedRelation: "sales_representatives"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          discount: number
          id: string
          notes: string | null
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          total: number
          unit_price: number
          user_id: string
        }
        Insert: {
          created_at?: string
          discount?: number
          id?: string
          notes?: string | null
          order_id: string
          product_id?: string | null
          product_name: string
          quantity?: number
          total?: number
          unit_price?: number
          user_id: string
        }
        Update: {
          created_at?: string
          discount?: number
          id?: string
          notes?: string | null
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          total?: number
          unit_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          customer_address: string | null
          customer_name: string
          customer_phone: string | null
          delivery_date: string | null
          discount: number
          id: string
          linked_invoice_id: string | null
          notes: string | null
          order_date: string
          order_number: string | null
          payment_method: string | null
          payment_status: string
          representative_id: string | null
          shipping_cost: number
          shipping_method: string | null
          source: string | null
          status: string
          subtotal: number
          total: number
          tracking_number: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_address?: string | null
          customer_name: string
          customer_phone?: string | null
          delivery_date?: string | null
          discount?: number
          id?: string
          linked_invoice_id?: string | null
          notes?: string | null
          order_date?: string
          order_number?: string | null
          payment_method?: string | null
          payment_status?: string
          representative_id?: string | null
          shipping_cost?: number
          shipping_method?: string | null
          source?: string | null
          status?: string
          subtotal?: number
          total?: number
          tracking_number?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_address?: string | null
          customer_name?: string
          customer_phone?: string | null
          delivery_date?: string | null
          discount?: number
          id?: string
          linked_invoice_id?: string | null
          notes?: string | null
          order_date?: string
          order_number?: string | null
          payment_method?: string | null
          payment_status?: string
          representative_id?: string | null
          shipping_cost?: number
          shipping_method?: string | null
          source?: string | null
          status?: string
          subtotal?: number
          total?: number
          tracking_number?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_representative_id_fkey"
            columns: ["representative_id"]
            isOneToOne: false
            referencedRelation: "sales_representatives"
            referencedColumns: ["id"]
          },
        ]
      }
      passkey_credentials: {
        Row: {
          counter: number
          created_at: string
          credential_id: string
          device_name: string | null
          id: string
          public_key: string
          user_id: string
        }
        Insert: {
          counter?: number
          created_at?: string
          credential_id: string
          device_name?: string | null
          id?: string
          public_key: string
          user_id: string
        }
        Update: {
          counter?: number
          created_at?: string
          credential_id?: string
          device_name?: string | null
          id?: string
          public_key?: string
          user_id?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          buy_price: number
          category: string
          created_at: string
          id: string
          min_quantity: number
          name: string
          notes: string | null
          quantity: number
          sell_price: number
          sku: string | null
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          buy_price?: number
          category?: string
          created_at?: string
          id?: string
          min_quantity?: number
          name: string
          notes?: string | null
          quantity?: number
          sell_price?: number
          sku?: string | null
          unit?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          buy_price?: number
          category?: string
          created_at?: string
          id?: string
          min_quantity?: number
          name?: string
          notes?: string | null
          quantity?: number
          sell_price?: number
          sku?: string | null
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          business_type: string | null
          company_name: string | null
          country: string | null
          created_at: string
          display_name: string | null
          has_employees: boolean | null
          has_inventory: boolean | null
          has_receivables: boolean | null
          id: string
          setup_completed: boolean | null
          updated_at: string
          user_id: string
          work_field: string | null
        }
        Insert: {
          address?: string | null
          business_type?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          has_employees?: boolean | null
          has_inventory?: boolean | null
          has_receivables?: boolean | null
          id?: string
          setup_completed?: boolean | null
          updated_at?: string
          user_id: string
          work_field?: string | null
        }
        Update: {
          address?: string | null
          business_type?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          has_employees?: boolean | null
          has_inventory?: boolean | null
          has_receivables?: boolean | null
          id?: string
          setup_completed?: boolean | null
          updated_at?: string
          user_id?: string
          work_field?: string | null
        }
        Relationships: []
      }
      sales_representatives: {
        Row: {
          collection_commission_rate: number
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          linked_account_name: string | null
          notes: string | null
          phone: string | null
          region: string | null
          sales_commission_rate: number
          updated_at: string
          user_id: string
        }
        Insert: {
          collection_commission_rate?: number
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          linked_account_name?: string | null
          notes?: string | null
          phone?: string | null
          region?: string | null
          sales_commission_rate?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          collection_commission_rate?: number
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          linked_account_name?: string | null
          notes?: string | null
          phone?: string | null
          region?: string | null
          sales_commission_rate?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          created_at: string
          id: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          product_id: string
          quantity: number
          reference_note: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          product_id: string
          quantity: number
          reference_note?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          movement_type?: Database["public"]["Enums"]["stock_movement_type"]
          product_id?: string
          quantity?: number
          reference_note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      webauthn_challenges: {
        Row: {
          challenge: string
          created_at: string
          id: string
          type: string
          user_id: string | null
        }
        Insert: {
          challenge: string
          created_at?: string
          id?: string
          type: string
          user_id?: string | null
        }
        Update: {
          challenge?: string
          created_at?: string
          id?: string
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      cheque_status:
        | "مسجل"
        | "آجل"
        | "مستحق"
        | "مودع"
        | "محصل"
        | "مرتجع"
        | "ملغي"
      cheque_type: "وارد" | "صادر"
      product_category:
        | "بضاعة عامة"
        | "مواد خام"
        | "مواد تعبئة"
        | "قطع غيار"
        | "أخرى"
      stock_movement_type: "وارد" | "صادر" | "تعديل يدوي"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      cheque_status: ["مسجل", "آجل", "مستحق", "مودع", "محصل", "مرتجع", "ملغي"],
      cheque_type: ["وارد", "صادر"],
      product_category: [
        "بضاعة عامة",
        "مواد خام",
        "مواد تعبئة",
        "قطع غيار",
        "أخرى",
      ],
      stock_movement_type: ["وارد", "صادر", "تعديل يدوي"],
    },
  },
} as const

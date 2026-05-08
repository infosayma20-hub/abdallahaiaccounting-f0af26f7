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
      accountant_permissions: {
        Row: {
          accountant_auth_id: string
          can_create_journal: boolean | null
          can_create_payment: boolean | null
          can_create_purchase_invoice: boolean | null
          can_create_receipt: boolean | null
          can_create_sale_invoice: boolean | null
          can_delete_invoices: boolean | null
          can_delete_vouchers: boolean | null
          can_edit_invoices: boolean | null
          can_edit_vouchers: boolean | null
          can_export_data: boolean | null
          can_manage_accounts: boolean | null
          can_manage_banks: boolean | null
          can_manage_cash_boxes: boolean | null
          can_manage_cheques: boolean | null
          can_manage_customers: boolean | null
          can_manage_inventory: boolean | null
          can_manage_orders: boolean | null
          can_manage_products: boolean | null
          can_manage_suppliers: boolean | null
          can_view_account_statement: boolean | null
          can_view_balance_sheet: boolean | null
          can_view_balances: boolean | null
          can_view_ledger: boolean | null
          can_view_profit_loss: boolean | null
          can_view_reports: boolean | null
          can_view_trial_balance: boolean | null
          created_at: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          accountant_auth_id: string
          can_create_journal?: boolean | null
          can_create_payment?: boolean | null
          can_create_purchase_invoice?: boolean | null
          can_create_receipt?: boolean | null
          can_create_sale_invoice?: boolean | null
          can_delete_invoices?: boolean | null
          can_delete_vouchers?: boolean | null
          can_edit_invoices?: boolean | null
          can_edit_vouchers?: boolean | null
          can_export_data?: boolean | null
          can_manage_accounts?: boolean | null
          can_manage_banks?: boolean | null
          can_manage_cash_boxes?: boolean | null
          can_manage_cheques?: boolean | null
          can_manage_customers?: boolean | null
          can_manage_inventory?: boolean | null
          can_manage_orders?: boolean | null
          can_manage_products?: boolean | null
          can_manage_suppliers?: boolean | null
          can_view_account_statement?: boolean | null
          can_view_balance_sheet?: boolean | null
          can_view_balances?: boolean | null
          can_view_ledger?: boolean | null
          can_view_profit_loss?: boolean | null
          can_view_reports?: boolean | null
          can_view_trial_balance?: boolean | null
          created_at?: string | null
          email: string
          full_name: string
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          accountant_auth_id?: string
          can_create_journal?: boolean | null
          can_create_payment?: boolean | null
          can_create_purchase_invoice?: boolean | null
          can_create_receipt?: boolean | null
          can_create_sale_invoice?: boolean | null
          can_delete_invoices?: boolean | null
          can_delete_vouchers?: boolean | null
          can_edit_invoices?: boolean | null
          can_edit_vouchers?: boolean | null
          can_export_data?: boolean | null
          can_manage_accounts?: boolean | null
          can_manage_banks?: boolean | null
          can_manage_cash_boxes?: boolean | null
          can_manage_cheques?: boolean | null
          can_manage_customers?: boolean | null
          can_manage_inventory?: boolean | null
          can_manage_orders?: boolean | null
          can_manage_products?: boolean | null
          can_manage_suppliers?: boolean | null
          can_view_account_statement?: boolean | null
          can_view_balance_sheet?: boolean | null
          can_view_balances?: boolean | null
          can_view_ledger?: boolean | null
          can_view_profit_loss?: boolean | null
          can_view_reports?: boolean | null
          can_view_trial_balance?: boolean | null
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      accounts: {
        Row: {
          account_code: string
          account_name: string
          account_type: string
          created_at: string
          description_ar: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          is_contra: boolean | null
          is_system: boolean | null
          is_system_protected: boolean | null
          nature: string | null
          notes: string | null
          parent_code: string | null
          sub_group_label: string | null
          system_role: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_code: string
          account_name: string
          account_type?: string
          created_at?: string
          description_ar?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_contra?: boolean | null
          is_system?: boolean | null
          is_system_protected?: boolean | null
          nature?: string | null
          notes?: string | null
          parent_code?: string | null
          sub_group_label?: string | null
          system_role?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_code?: string
          account_name?: string
          account_type?: string
          created_at?: string
          description_ar?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_contra?: boolean | null
          is_system?: boolean | null
          is_system_protected?: boolean | null
          nature?: string | null
          notes?: string | null
          parent_code?: string | null
          sub_group_label?: string | null
          system_role?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      activity_log: {
        Row: {
          action: string
          actor_id: string
          actor_name: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_label: string | null
          entity_type: string
          id: string
          user_id: string
        }
        Insert: {
          action: string
          actor_id: string
          actor_name?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type: string
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          actor_name?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      add_ons: {
        Row: {
          addon_key: string
          created_at: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name_ar: string
          name_en: string
          price_per_unit_annual: number
          price_per_unit_monthly: number
          sort_order: number | null
          unit_label: string
        }
        Insert: {
          addon_key: string
          created_at?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name_ar: string
          name_en: string
          price_per_unit_annual?: number
          price_per_unit_monthly?: number
          sort_order?: number | null
          unit_label: string
        }
        Update: {
          addon_key?: string
          created_at?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name_ar?: string
          name_en?: string
          price_per_unit_annual?: number
          price_per_unit_monthly?: number
          sort_order?: number | null
          unit_label?: string
        }
        Relationships: []
      }
      admin_notifications: {
        Row: {
          created_at: string
          email_sent: boolean
          email_sent_at: string | null
          event_type: string
          id: string
          is_read: boolean
          metadata: Json | null
          user_email: string
          user_id: string
          user_name: string | null
        }
        Insert: {
          created_at?: string
          email_sent?: boolean
          email_sent_at?: string | null
          event_type: string
          id?: string
          is_read?: boolean
          metadata?: Json | null
          user_email: string
          user_id: string
          user_name?: string | null
        }
        Update: {
          created_at?: string
          email_sent?: boolean
          email_sent_at?: string | null
          event_type?: string
          id?: string
          is_read?: boolean
          metadata?: Json | null
          user_email?: string
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          message_count: number | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_count?: number | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_count?: number | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_memory: {
        Row: {
          created_at: string
          frequency: number
          id: string
          key: string
          last_used_at: string
          memory_type: string
          updated_at: string
          user_id: string
          value: Json
        }
        Insert: {
          created_at?: string
          frequency?: number
          id?: string
          key: string
          last_used_at?: string
          memory_type?: string
          updated_at?: string
          user_id: string
          value?: Json
        }
        Update: {
          created_at?: string
          frequency?: number
          id?: string
          key?: string
          last_used_at?: string
          memory_type?: string
          updated_at?: string
          user_id?: string
          value?: Json
        }
        Relationships: []
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_categories: {
        Row: {
          accumulated_depreciation_account_code: string | null
          asset_account_code: string | null
          code: string
          created_at: string | null
          default_depreciation_method: string | null
          default_salvage_rate: number | null
          default_useful_life_years: number | null
          depreciation_expense_account_code: string | null
          gain_loss_account_code: string | null
          id: string
          is_active: boolean | null
          name_ar: string
          parent_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          accumulated_depreciation_account_code?: string | null
          asset_account_code?: string | null
          code: string
          created_at?: string | null
          default_depreciation_method?: string | null
          default_salvage_rate?: number | null
          default_useful_life_years?: number | null
          depreciation_expense_account_code?: string | null
          gain_loss_account_code?: string | null
          id?: string
          is_active?: boolean | null
          name_ar: string
          parent_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          accumulated_depreciation_account_code?: string | null
          asset_account_code?: string | null
          code?: string
          created_at?: string | null
          default_depreciation_method?: string | null
          default_salvage_rate?: number | null
          default_useful_life_years?: number | null
          depreciation_expense_account_code?: string | null
          gain_loss_account_code?: string | null
          id?: string
          is_active?: boolean | null
          name_ar?: string
          parent_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "asset_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_depreciation_entries: {
        Row: {
          accumulated_total: number
          asset_id: string
          created_at: string | null
          depreciation_amount: number
          id: string
          method_used: string | null
          net_book_value: number
          notes: string | null
          period_end: string
          period_start: string
          status: string | null
          user_id: string
        }
        Insert: {
          accumulated_total?: number
          asset_id: string
          created_at?: string | null
          depreciation_amount?: number
          id?: string
          method_used?: string | null
          net_book_value?: number
          notes?: string | null
          period_end: string
          period_start: string
          status?: string | null
          user_id: string
        }
        Update: {
          accumulated_total?: number
          asset_id?: string
          created_at?: string | null
          depreciation_amount?: number
          id?: string
          method_used?: string | null
          net_book_value?: number
          notes?: string | null
          period_end?: string
          period_start?: string
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_depreciation_entries_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_disposals: {
        Row: {
          approved_by: string | null
          asset_id: string
          buyer_details: string | null
          buyer_name: string | null
          created_at: string | null
          disposal_date: string
          disposal_method: string
          disposal_number: string | null
          disposal_proceeds: number | null
          gain_loss: number | null
          id: string
          net_book_value_at_disposal: number | null
          reason: string | null
          user_id: string
        }
        Insert: {
          approved_by?: string | null
          asset_id: string
          buyer_details?: string | null
          buyer_name?: string | null
          created_at?: string | null
          disposal_date: string
          disposal_method: string
          disposal_number?: string | null
          disposal_proceeds?: number | null
          gain_loss?: number | null
          id?: string
          net_book_value_at_disposal?: number | null
          reason?: string | null
          user_id: string
        }
        Update: {
          approved_by?: string | null
          asset_id?: string
          buyer_details?: string | null
          buyer_name?: string | null
          created_at?: string | null
          disposal_date?: string
          disposal_method?: string
          disposal_number?: string | null
          disposal_proceeds?: number | null
          gain_loss?: number | null
          id?: string
          net_book_value_at_disposal?: number | null
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_disposals_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_maintenance: {
        Row: {
          asset_id: string
          capitalize: boolean | null
          cost: number | null
          created_at: string | null
          description: string | null
          id: string
          maintenance_date: string
          maintenance_number: string | null
          next_maintenance_date: string | null
          type: string
          user_id: string
          vendor_name: string | null
          warranty_covered: boolean | null
        }
        Insert: {
          asset_id: string
          capitalize?: boolean | null
          cost?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          maintenance_date: string
          maintenance_number?: string | null
          next_maintenance_date?: string | null
          type?: string
          user_id: string
          vendor_name?: string | null
          warranty_covered?: boolean | null
        }
        Update: {
          asset_id?: string
          capitalize?: boolean | null
          cost?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          maintenance_date?: string
          maintenance_number?: string | null
          next_maintenance_date?: string | null
          type?: string
          user_id?: string
          vendor_name?: string | null
          warranty_covered?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_maintenance_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_revaluations: {
        Row: {
          appraiser_name: string | null
          asset_id: string
          created_at: string | null
          id: string
          new_accumulated_depreciation: number | null
          new_cost: number | null
          new_net_book_value: number | null
          old_accumulated_depreciation: number | null
          old_cost: number | null
          old_net_book_value: number | null
          reason: string | null
          revaluation_date: string
          revaluation_surplus_or_deficit: number | null
          user_id: string
        }
        Insert: {
          appraiser_name?: string | null
          asset_id: string
          created_at?: string | null
          id?: string
          new_accumulated_depreciation?: number | null
          new_cost?: number | null
          new_net_book_value?: number | null
          old_accumulated_depreciation?: number | null
          old_cost?: number | null
          old_net_book_value?: number | null
          reason?: string | null
          revaluation_date: string
          revaluation_surplus_or_deficit?: number | null
          user_id: string
        }
        Update: {
          appraiser_name?: string | null
          asset_id?: string
          created_at?: string | null
          id?: string
          new_accumulated_depreciation?: number | null
          new_cost?: number | null
          new_net_book_value?: number | null
          old_accumulated_depreciation?: number | null
          old_cost?: number | null
          old_net_book_value?: number | null
          reason?: string | null
          revaluation_date?: string
          revaluation_surplus_or_deficit?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_revaluations_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_transfers: {
        Row: {
          approved_by: string | null
          asset_id: string
          created_at: string | null
          from_branch: string | null
          from_custodian: string | null
          from_department: string | null
          id: string
          reason: string | null
          to_branch: string | null
          to_custodian: string | null
          to_department: string | null
          transfer_date: string
          transfer_number: string | null
          user_id: string
        }
        Insert: {
          approved_by?: string | null
          asset_id: string
          created_at?: string | null
          from_branch?: string | null
          from_custodian?: string | null
          from_department?: string | null
          id?: string
          reason?: string | null
          to_branch?: string | null
          to_custodian?: string | null
          to_department?: string | null
          transfer_date: string
          transfer_number?: string | null
          user_id: string
        }
        Update: {
          approved_by?: string | null
          asset_id?: string
          created_at?: string | null
          from_branch?: string | null
          from_custodian?: string | null
          from_department?: string | null
          id?: string
          reason?: string | null
          to_branch?: string | null
          to_custodian?: string | null
          to_department?: string | null
          transfer_date?: string
          transfer_number?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_transfers_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          accumulated_depreciation: number | null
          acquisition_cost: number
          acquisition_date: string
          additional_costs: number | null
          asset_number: string
          barcode: string | null
          branch_id: string | null
          category_id: string | null
          cost_ils: number | null
          created_at: string | null
          currency_id: string | null
          custodian_id: string | null
          custodian_name: string | null
          declining_balance_rate: number | null
          department: string | null
          depreciation_method: string
          depreciation_start_date: string | null
          description: string | null
          disposal_amount: number | null
          disposal_date: string | null
          disposal_method: string | null
          exchange_rate: number | null
          id: string
          image_url: string | null
          in_service_date: string | null
          insurance_expiry_date: string | null
          insurance_policy: string | null
          invoice_number: string | null
          last_depreciation_date: string | null
          location: string | null
          manufacturer: string | null
          model: string | null
          name_ar: string
          net_book_value: number | null
          notes: string | null
          purchase_order_number: string | null
          salvage_value: number | null
          serial_number: string | null
          status: string
          supplier_name: string | null
          total_cost: number | null
          total_units: number | null
          updated_at: string | null
          useful_life_months: number | null
          useful_life_years: number | null
          user_id: string
          warranty_expiry_date: string | null
        }
        Insert: {
          accumulated_depreciation?: number | null
          acquisition_cost?: number
          acquisition_date: string
          additional_costs?: number | null
          asset_number: string
          barcode?: string | null
          branch_id?: string | null
          category_id?: string | null
          cost_ils?: number | null
          created_at?: string | null
          currency_id?: string | null
          custodian_id?: string | null
          custodian_name?: string | null
          declining_balance_rate?: number | null
          department?: string | null
          depreciation_method?: string
          depreciation_start_date?: string | null
          description?: string | null
          disposal_amount?: number | null
          disposal_date?: string | null
          disposal_method?: string | null
          exchange_rate?: number | null
          id?: string
          image_url?: string | null
          in_service_date?: string | null
          insurance_expiry_date?: string | null
          insurance_policy?: string | null
          invoice_number?: string | null
          last_depreciation_date?: string | null
          location?: string | null
          manufacturer?: string | null
          model?: string | null
          name_ar: string
          net_book_value?: number | null
          notes?: string | null
          purchase_order_number?: string | null
          salvage_value?: number | null
          serial_number?: string | null
          status?: string
          supplier_name?: string | null
          total_cost?: number | null
          total_units?: number | null
          updated_at?: string | null
          useful_life_months?: number | null
          useful_life_years?: number | null
          user_id: string
          warranty_expiry_date?: string | null
        }
        Update: {
          accumulated_depreciation?: number | null
          acquisition_cost?: number
          acquisition_date?: string
          additional_costs?: number | null
          asset_number?: string
          barcode?: string | null
          branch_id?: string | null
          category_id?: string | null
          cost_ils?: number | null
          created_at?: string | null
          currency_id?: string | null
          custodian_id?: string | null
          custodian_name?: string | null
          declining_balance_rate?: number | null
          department?: string | null
          depreciation_method?: string
          depreciation_start_date?: string | null
          description?: string | null
          disposal_amount?: number | null
          disposal_date?: string | null
          disposal_method?: string | null
          exchange_rate?: number | null
          id?: string
          image_url?: string | null
          in_service_date?: string | null
          insurance_expiry_date?: string | null
          insurance_policy?: string | null
          invoice_number?: string | null
          last_depreciation_date?: string | null
          location?: string | null
          manufacturer?: string | null
          model?: string | null
          name_ar?: string
          net_book_value?: number | null
          notes?: string | null
          purchase_order_number?: string | null
          salvage_value?: number | null
          serial_number?: string | null
          status?: string
          supplier_name?: string | null
          total_cost?: number | null
          total_units?: number | null
          updated_at?: string | null
          useful_life_months?: number | null
          useful_life_years?: number | null
          user_id?: string
          warranty_expiry_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "asset_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_custodian_id_fkey"
            columns: ["custodian_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_custodian_id_fkey"
            columns: ["custodian_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_audit_logs: {
        Row: {
          action: string
          changed_by: string
          created_at: string
          id: string
          new_values: Json | null
          old_values: Json | null
          reason: string | null
          record_id: string
          table_name: string
        }
        Insert: {
          action: string
          changed_by: string
          created_at?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          reason?: string | null
          record_id: string
          table_name: string
        }
        Update: {
          action?: string
          changed_by?: string
          created_at?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          reason?: string | null
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      attendance_breaks: {
        Row: {
          attendance_day_id: string | null
          auth_user_id: string
          branch_id: string | null
          break_in: string | null
          break_out: string
          created_at: string | null
          duration_minutes: number | null
          employee_id: string
          id: string
          reason: string | null
        }
        Insert: {
          attendance_day_id?: string | null
          auth_user_id: string
          branch_id?: string | null
          break_in?: string | null
          break_out?: string
          created_at?: string | null
          duration_minutes?: number | null
          employee_id: string
          id?: string
          reason?: string | null
        }
        Update: {
          attendance_day_id?: string | null
          auth_user_id?: string
          branch_id?: string | null
          break_in?: string | null
          break_out?: string
          created_at?: string | null
          duration_minutes?: number | null
          employee_id?: string
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_breaks_attendance_day_id_fkey"
            columns: ["attendance_day_id"]
            isOneToOne: false
            referencedRelation: "attendance_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_breaks_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_breaks_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_breaks_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_breaks_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_days: {
        Row: {
          attendance_date: string
          auth_user_id: string
          branch_id: string | null
          created_at: string
          employee_id: string
          first_check_in: string | null
          id: string
          is_manually_adjusted: boolean | null
          last_check_out: string | null
          net_work_minutes: number | null
          notes: string | null
          overtime_hours: number | null
          status: string
          total_break_minutes: number | null
          total_hours: number | null
          updated_at: string
        }
        Insert: {
          attendance_date?: string
          auth_user_id: string
          branch_id?: string | null
          created_at?: string
          employee_id: string
          first_check_in?: string | null
          id?: string
          is_manually_adjusted?: boolean | null
          last_check_out?: string | null
          net_work_minutes?: number | null
          notes?: string | null
          overtime_hours?: number | null
          status?: string
          total_break_minutes?: number | null
          total_hours?: number | null
          updated_at?: string
        }
        Update: {
          attendance_date?: string
          auth_user_id?: string
          branch_id?: string | null
          created_at?: string
          employee_id?: string
          first_check_in?: string | null
          id?: string
          is_manually_adjusted?: boolean | null
          last_check_out?: string | null
          net_work_minutes?: number | null
          notes?: string | null
          overtime_hours?: number | null
          status?: string
          total_break_minutes?: number | null
          total_hours?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_days_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_days_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_days_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_days_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_events: {
        Row: {
          auth_user_id: string
          branch_id: string
          created_at: string
          device_info: string | null
          employee_id: string
          event_time: string
          event_type: string
          id: string
          latitude: number | null
          longitude: number | null
          notes: string | null
          qr_token_used: string | null
          status: string
        }
        Insert: {
          auth_user_id: string
          branch_id: string
          created_at?: string
          device_info?: string | null
          employee_id: string
          event_time?: string
          event_type: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          qr_token_used?: string | null
          status?: string
        }
        Update: {
          auth_user_id?: string
          branch_id?: string
          created_at?: string
          device_info?: string | null
          employee_id?: string
          event_time?: string
          event_type?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          qr_token_used?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_events_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_events_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_number: string | null
          account_type: string | null
          bank_name: string
          branch: string | null
          commission_account_code: string | null
          created_at: string | null
          currency: string | null
          gl_account_code: string | null
          id: string
          incoming_checks_account_code: string | null
          is_active: boolean | null
          min_balance_alert: number | null
          name: string
          notes: string | null
          opening_balance: number | null
          opening_balance_date: string | null
          outgoing_checks_account_code: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_number?: string | null
          account_type?: string | null
          bank_name: string
          branch?: string | null
          commission_account_code?: string | null
          created_at?: string | null
          currency?: string | null
          gl_account_code?: string | null
          id?: string
          incoming_checks_account_code?: string | null
          is_active?: boolean | null
          min_balance_alert?: number | null
          name: string
          notes?: string | null
          opening_balance?: number | null
          opening_balance_date?: string | null
          outgoing_checks_account_code?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_number?: string | null
          account_type?: string | null
          bank_name?: string
          branch?: string | null
          commission_account_code?: string | null
          created_at?: string | null
          currency?: string | null
          gl_account_code?: string | null
          id?: string
          incoming_checks_account_code?: string | null
          is_active?: boolean | null
          min_balance_alert?: number | null
          name?: string
          notes?: string | null
          opening_balance?: number | null
          opening_balance_date?: string | null
          outgoing_checks_account_code?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      branch_manager_assignments: {
        Row: {
          branch_id: string
          company_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          branch_id: string
          company_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          branch_id?: string
          company_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      branches: {
        Row: {
          address: string | null
          created_at: string
          id: string
          is_active: boolean
          latitude: number
          longitude: number
          name: string
          qr_mode: string
          qr_rotation_minutes: number
          radius_meters: number
          require_gps: boolean
          secret_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          latitude: number
          longitude: number
          name: string
          qr_mode?: string
          qr_rotation_minutes?: number
          radius_meters?: number
          require_gps?: boolean
          secret_key?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          latitude?: number
          longitude?: number
          name?: string
          qr_mode?: string
          qr_rotation_minutes?: number
          radius_meters?: number
          require_gps?: boolean
          secret_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      call_center_orders: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string | null
          customer_name: string | null
          customer_phone: string | null
          delivery_address: string | null
          delivery_type: string | null
          dispatched_by: string | null
          dispatched_by_name: string | null
          id: string
          items: Json
          order_note: string | null
          payment_method: string | null
          pos_order_id: string | null
          session_id: string | null
          source_app: string | null
          status: string | null
          target_branch_id: string | null
          target_branch_name: string | null
          total: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivery_address?: string | null
          delivery_type?: string | null
          dispatched_by?: string | null
          dispatched_by_name?: string | null
          id?: string
          items?: Json
          order_note?: string | null
          payment_method?: string | null
          pos_order_id?: string | null
          session_id?: string | null
          source_app?: string | null
          status?: string | null
          target_branch_id?: string | null
          target_branch_name?: string | null
          total?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivery_address?: string | null
          delivery_type?: string | null
          dispatched_by?: string | null
          dispatched_by_name?: string | null
          id?: string
          items?: Json
          order_note?: string | null
          payment_method?: string | null
          pos_order_id?: string | null
          session_id?: string | null
          source_app?: string | null
          status?: string | null
          target_branch_id?: string | null
          target_branch_name?: string | null
          total?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_center_orders_target_branch_id_fkey"
            columns: ["target_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_center_orders_target_branch_id_fkey"
            columns: ["target_branch_id"]
            isOneToOne: false
            referencedRelation: "branches_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_boxes: {
        Row: {
          auto_transfer_threshold: number | null
          auto_transfer_to_main: boolean | null
          auto_transfer_trigger: string | null
          branch_id: string | null
          branch_location: string | null
          created_at: string | null
          currency: string | null
          gl_account_code: string | null
          id: string
          is_active: boolean | null
          max_balance_action: string | null
          max_balance_alert: number | null
          min_balance_alert: number | null
          name: string
          notes: string | null
          opening_balance: number | null
          opening_balance_date: string | null
          pos_auto_post: boolean | null
          pos_post_trigger: string | null
          pos_terminal_id: string | null
          responsible_id: string | null
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          auto_transfer_threshold?: number | null
          auto_transfer_to_main?: boolean | null
          auto_transfer_trigger?: string | null
          branch_id?: string | null
          branch_location?: string | null
          created_at?: string | null
          currency?: string | null
          gl_account_code?: string | null
          id?: string
          is_active?: boolean | null
          max_balance_action?: string | null
          max_balance_alert?: number | null
          min_balance_alert?: number | null
          name: string
          notes?: string | null
          opening_balance?: number | null
          opening_balance_date?: string | null
          pos_auto_post?: boolean | null
          pos_post_trigger?: string | null
          pos_terminal_id?: string | null
          responsible_id?: string | null
          type?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          auto_transfer_threshold?: number | null
          auto_transfer_to_main?: boolean | null
          auto_transfer_trigger?: string | null
          branch_id?: string | null
          branch_location?: string | null
          created_at?: string | null
          currency?: string | null
          gl_account_code?: string | null
          id?: string
          is_active?: boolean | null
          max_balance_action?: string | null
          max_balance_alert?: number | null
          min_balance_alert?: number | null
          name?: string
          notes?: string | null
          opening_balance?: number | null
          opening_balance_date?: string | null
          pos_auto_post?: boolean | null
          pos_post_trigger?: string | null
          pos_terminal_id?: string | null
          responsible_id?: string | null
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_boxes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_boxes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_transfers: {
        Row: {
          amount: number
          amount_ils: number | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          description: string | null
          exchange_rate: number | null
          from_box_id: string | null
          id: string
          pos_session_id: string | null
          received_by: string | null
          to_box_id: string | null
          transfer_date: string
          transfer_type: string | null
          user_id: string
          voucher_id: string | null
        }
        Insert: {
          amount: number
          amount_ils?: number | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          description?: string | null
          exchange_rate?: number | null
          from_box_id?: string | null
          id?: string
          pos_session_id?: string | null
          received_by?: string | null
          to_box_id?: string | null
          transfer_date: string
          transfer_type?: string | null
          user_id: string
          voucher_id?: string | null
        }
        Update: {
          amount?: number
          amount_ils?: number | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          description?: string | null
          exchange_rate?: number | null
          from_box_id?: string | null
          id?: string
          pos_session_id?: string | null
          received_by?: string | null
          to_box_id?: string | null
          transfer_date?: string
          transfer_type?: string | null
          user_id?: string
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_transfers_from_box_id_fkey"
            columns: ["from_box_id"]
            isOneToOne: false
            referencedRelation: "cash_boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transfers_to_box_id_fkey"
            columns: ["to_box_id"]
            isOneToOne: false
            referencedRelation: "cash_boxes"
            referencedColumns: ["id"]
          },
        ]
      }
      cheque_status_history: {
        Row: {
          action_type: string | null
          cheque_id: string
          created_at: string
          details: Json | null
          from_status: Database["public"]["Enums"]["cheque_status"] | null
          id: string
          linked_transaction_id: string | null
          reason: string | null
          to_status: Database["public"]["Enums"]["cheque_status"]
          user_id: string
        }
        Insert: {
          action_type?: string | null
          cheque_id: string
          created_at?: string
          details?: Json | null
          from_status?: Database["public"]["Enums"]["cheque_status"] | null
          id?: string
          linked_transaction_id?: string | null
          reason?: string | null
          to_status: Database["public"]["Enums"]["cheque_status"]
          user_id: string
        }
        Update: {
          action_type?: string | null
          cheque_id?: string
          created_at?: string
          details?: Json | null
          from_status?: Database["public"]["Enums"]["cheque_status"] | null
          id?: string
          linked_transaction_id?: string | null
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
          {
            foreignKeyName: "cheque_status_history_cheque_id_fkey"
            columns: ["cheque_id"]
            isOneToOne: false
            referencedRelation: "v_drift_cheque_no_voucher"
            referencedColumns: ["id"]
          },
        ]
      }
      cheques: {
        Row: {
          account_number: string | null
          amount: number
          bank_fees: number | null
          bank_name: string | null
          bounce_date: string | null
          bounce_reason: string | null
          cashed_date: string | null
          cheque_date: string
          cheque_number: string | null
          cheque_type: Database["public"]["Enums"]["cheque_type"]
          collection_date: string | null
          contact_id: string | null
          created_at: string
          currency: string
          deposit_bank_account_id: string | null
          deposit_date: string | null
          endorsed_at: string | null
          endorsed_to_contact_id: string | null
          endorsed_to_name: string | null
          endorsement_notes: string | null
          endorsement_voucher_id: string | null
          id: string
          image_url: string | null
          linked_account: string | null
          linked_transaction_id: string | null
          notes: string | null
          original_contact_id: string | null
          party_name: string
          party_type: string
          receipt_voucher_id: string | null
          source_bank_account_id: string | null
          status: Database["public"]["Enums"]["cheque_status"]
          updated_at: string
          user_id: string
          voucher_id: string | null
        }
        Insert: {
          account_number?: string | null
          amount: number
          bank_fees?: number | null
          bank_name?: string | null
          bounce_date?: string | null
          bounce_reason?: string | null
          cashed_date?: string | null
          cheque_date: string
          cheque_number?: string | null
          cheque_type: Database["public"]["Enums"]["cheque_type"]
          collection_date?: string | null
          contact_id?: string | null
          created_at?: string
          currency?: string
          deposit_bank_account_id?: string | null
          deposit_date?: string | null
          endorsed_at?: string | null
          endorsed_to_contact_id?: string | null
          endorsed_to_name?: string | null
          endorsement_notes?: string | null
          endorsement_voucher_id?: string | null
          id?: string
          image_url?: string | null
          linked_account?: string | null
          linked_transaction_id?: string | null
          notes?: string | null
          original_contact_id?: string | null
          party_name: string
          party_type?: string
          receipt_voucher_id?: string | null
          source_bank_account_id?: string | null
          status?: Database["public"]["Enums"]["cheque_status"]
          updated_at?: string
          user_id: string
          voucher_id?: string | null
        }
        Update: {
          account_number?: string | null
          amount?: number
          bank_fees?: number | null
          bank_name?: string | null
          bounce_date?: string | null
          bounce_reason?: string | null
          cashed_date?: string | null
          cheque_date?: string
          cheque_number?: string | null
          cheque_type?: Database["public"]["Enums"]["cheque_type"]
          collection_date?: string | null
          contact_id?: string | null
          created_at?: string
          currency?: string
          deposit_bank_account_id?: string | null
          deposit_date?: string | null
          endorsed_at?: string | null
          endorsed_to_contact_id?: string | null
          endorsed_to_name?: string | null
          endorsement_notes?: string | null
          endorsement_voucher_id?: string | null
          id?: string
          image_url?: string | null
          linked_account?: string | null
          linked_transaction_id?: string | null
          notes?: string | null
          original_contact_id?: string | null
          party_name?: string
          party_type?: string
          receipt_voucher_id?: string | null
          source_bank_account_id?: string | null
          status?: Database["public"]["Enums"]["cheque_status"]
          updated_at?: string
          user_id?: string
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cheques_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheques_source_bank_account_id_fkey"
            columns: ["source_bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheques_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheques_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "v_drift_tx_no_idempotency"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheques_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "v_drift_tx_no_reference"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheques_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "v_drift_tx_same_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheques_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "v_drift_tx_zero_amount"
            referencedColumns: ["id"]
          },
        ]
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
      companies: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          invoice_number_offset: number
          is_active: boolean
          logo_url: string | null
          name: string
          owner_id: string
          phone: string | null
          tax_number: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          invoice_number_offset?: number
          is_active?: boolean
          logo_url?: string | null
          name?: string
          owner_id: string
          phone?: string | null
          tax_number?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          invoice_number_offset?: number
          is_active?: boolean
          logo_url?: string | null
          name?: string
          owner_id?: string
          phone?: string | null
          tax_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      company_profiles: {
        Row: {
          accounting_experience: string | null
          annual_revenue: string | null
          business_goals: string[] | null
          business_type: string | null
          city: string | null
          company_id: string | null
          country: string | null
          created_at: string | null
          employees_count: string | null
          has_employees: boolean | null
          id: string
          industry: string | null
          industry_ar: string | null
          onboarding_completed: boolean | null
          onboarding_step: number | null
          pain_points: string[] | null
          primary_currency: string | null
          referral_source: string | null
        }
        Insert: {
          accounting_experience?: string | null
          annual_revenue?: string | null
          business_goals?: string[] | null
          business_type?: string | null
          city?: string | null
          company_id?: string | null
          country?: string | null
          created_at?: string | null
          employees_count?: string | null
          has_employees?: boolean | null
          id?: string
          industry?: string | null
          industry_ar?: string | null
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          pain_points?: string[] | null
          primary_currency?: string | null
          referral_source?: string | null
        }
        Update: {
          accounting_experience?: string | null
          annual_revenue?: string | null
          business_goals?: string[] | null
          business_type?: string | null
          city?: string | null
          company_id?: string | null
          country?: string | null
          created_at?: string | null
          employees_count?: string | null
          has_employees?: boolean | null
          id?: string
          industry?: string | null
          industry_ar?: string | null
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          pain_points?: string[] | null
          primary_currency?: string | null
          referral_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          address: string | null
          allow_discount: boolean | null
          allow_invoice_edit_after_approval: boolean | null
          base_currency: string | null
          business_type: string | null
          calendar_type: string | null
          can_delete_posted: boolean | null
          can_edit_posted: boolean | null
          card_bank_account_id: string | null
          city: string | null
          commercial_register: string | null
          company_name: string | null
          default_bank_account: string | null
          default_cash_account: string | null
          default_expense_account: string | null
          default_invoice_currency: string | null
          default_invoice_language: string | null
          default_invoice_terms: string | null
          default_payable_account: string | null
          default_payment_terms: string | null
          default_receivable_account: string | null
          default_revenue_account: string | null
          e_invoice_enabled: boolean | null
          email: string | null
          employee_count_range: string | null
          exchange_rate_source: string | null
          extra_currencies: Json | null
          feature_flags: Json
          fiscal_year_start: number | null
          has_employees: boolean | null
          has_pos: boolean | null
          hidden_apps: string[] | null
          hr_annual_leave_days: number | null
          hr_carry_over_leave: boolean | null
          hr_daily_hours: number | null
          hr_late_grace_minutes: number | null
          hr_require_gps: boolean | null
          hr_require_qr: boolean | null
          hr_salary_currency: string | null
          hr_salary_day: number | null
          hr_shift_end: string | null
          hr_shift_start: string | null
          hr_show_loan_form: boolean | null
          hr_show_policies: boolean | null
          hr_sick_leave_days: number | null
          hr_social_security: boolean | null
          hr_work_days_per_week: number | null
          id: string
          income_tax_enabled: boolean | null
          income_tax_rate: number | null
          inventory_allow_no_barcode: boolean | null
          inventory_auto_barcode: boolean | null
          inventory_costing_method: string | null
          inventory_default_max_qty: number | null
          inventory_default_min_qty: number | null
          inventory_default_unit: string | null
          inventory_expiry_alert: boolean | null
          inventory_expiry_days: number | null
          inventory_low_stock_alert: boolean | null
          inventory_method: string | null
          invoice_default_notes: string | null
          invoice_font: string | null
          invoice_footer: string | null
          invoice_footer_message: string | null
          invoice_header_layout: string | null
          invoice_prefix: string | null
          invoice_primary_color: string | null
          invoice_show_amount_words: boolean | null
          invoice_show_due_date: boolean | null
          invoice_show_signature: boolean | null
          invoice_show_tax_summary: boolean | null
          journal_prefix: string | null
          last_locked_period: string | null
          licensed_dealer_number: string | null
          logo_url: string | null
          max_discount_percent: number | null
          onboarding_completed: boolean | null
          onboarding_completed_at: string | null
          onboarding_skipped: boolean | null
          onboarding_step: number | null
          paper_size: string | null
          payment_prefix: string | null
          period_lock_mode: string | null
          phone: string | null
          phone2: string | null
          pos_allow_order_transfer: boolean | null
          pos_auto_print: boolean | null
          pos_auto_update_stock: boolean | null
          pos_branch_id: string | null
          pos_call_center_enabled: boolean
          pos_count: number | null
          pos_day_cutoff_hour: number | null
          pos_default_opening_balance: number | null
          pos_deficit_alert: boolean | null
          pos_deficit_threshold: number | null
          pos_disable_cogs: boolean
          pos_disable_stock_deduction: boolean
          pos_kitchen_auto_print: boolean | null
          pos_kitchen_ticket_size: string | null
          pos_mode: string
          pos_name: string | null
          pos_payment_methods: Json | null
          pos_prevent_zero_stock: boolean | null
          pos_receipt_copies: number | null
          pos_receipt_size: string | null
          pos_require_cash_box: boolean | null
          pos_require_device_fingerprint: boolean | null
          pos_require_shift: boolean | null
          pos_return_policy_days: number | null
          pos_show_return_policy: boolean | null
          pos_show_tax: boolean | null
          pos_warn_out_of_stock: boolean | null
          primary_color: string | null
          print_decorative_ornaments: boolean | null
          purchase_order_prefix: string | null
          receipt_prefix: string | null
          rep_allow_negative_stock: boolean
          rep_disable_stock_deduction: boolean
          reset_numbering_yearly: boolean | null
          security_2fa_enabled: boolean | null
          security_allowed_ips: string | null
          security_audit_log: boolean | null
          security_ip_restrict: boolean | null
          security_lockout_enabled: boolean | null
          security_max_attempts: number | null
          security_new_device_alert: boolean | null
          security_passkeys_enabled: boolean | null
          security_session_timeout: number | null
          security_warning_minutes: number | null
          show_address_on_invoice: boolean | null
          show_bank_on_invoice: boolean | null
          show_logo_on_invoice: boolean | null
          show_tax_on_invoice: boolean | null
          tax_number: string | null
          updated_at: string | null
          updated_by: string | null
          user_id: string
          vat_enabled: boolean | null
          vat_inclusive: boolean | null
          vat_purchases_account: string | null
          vat_rate: number | null
          vat_sales_account: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          allow_discount?: boolean | null
          allow_invoice_edit_after_approval?: boolean | null
          base_currency?: string | null
          business_type?: string | null
          calendar_type?: string | null
          can_delete_posted?: boolean | null
          can_edit_posted?: boolean | null
          card_bank_account_id?: string | null
          city?: string | null
          commercial_register?: string | null
          company_name?: string | null
          default_bank_account?: string | null
          default_cash_account?: string | null
          default_expense_account?: string | null
          default_invoice_currency?: string | null
          default_invoice_language?: string | null
          default_invoice_terms?: string | null
          default_payable_account?: string | null
          default_payment_terms?: string | null
          default_receivable_account?: string | null
          default_revenue_account?: string | null
          e_invoice_enabled?: boolean | null
          email?: string | null
          employee_count_range?: string | null
          exchange_rate_source?: string | null
          extra_currencies?: Json | null
          feature_flags?: Json
          fiscal_year_start?: number | null
          has_employees?: boolean | null
          has_pos?: boolean | null
          hidden_apps?: string[] | null
          hr_annual_leave_days?: number | null
          hr_carry_over_leave?: boolean | null
          hr_daily_hours?: number | null
          hr_late_grace_minutes?: number | null
          hr_require_gps?: boolean | null
          hr_require_qr?: boolean | null
          hr_salary_currency?: string | null
          hr_salary_day?: number | null
          hr_shift_end?: string | null
          hr_shift_start?: string | null
          hr_show_loan_form?: boolean | null
          hr_show_policies?: boolean | null
          hr_sick_leave_days?: number | null
          hr_social_security?: boolean | null
          hr_work_days_per_week?: number | null
          id?: string
          income_tax_enabled?: boolean | null
          income_tax_rate?: number | null
          inventory_allow_no_barcode?: boolean | null
          inventory_auto_barcode?: boolean | null
          inventory_costing_method?: string | null
          inventory_default_max_qty?: number | null
          inventory_default_min_qty?: number | null
          inventory_default_unit?: string | null
          inventory_expiry_alert?: boolean | null
          inventory_expiry_days?: number | null
          inventory_low_stock_alert?: boolean | null
          inventory_method?: string | null
          invoice_default_notes?: string | null
          invoice_font?: string | null
          invoice_footer?: string | null
          invoice_footer_message?: string | null
          invoice_header_layout?: string | null
          invoice_prefix?: string | null
          invoice_primary_color?: string | null
          invoice_show_amount_words?: boolean | null
          invoice_show_due_date?: boolean | null
          invoice_show_signature?: boolean | null
          invoice_show_tax_summary?: boolean | null
          journal_prefix?: string | null
          last_locked_period?: string | null
          licensed_dealer_number?: string | null
          logo_url?: string | null
          max_discount_percent?: number | null
          onboarding_completed?: boolean | null
          onboarding_completed_at?: string | null
          onboarding_skipped?: boolean | null
          onboarding_step?: number | null
          paper_size?: string | null
          payment_prefix?: string | null
          period_lock_mode?: string | null
          phone?: string | null
          phone2?: string | null
          pos_allow_order_transfer?: boolean | null
          pos_auto_print?: boolean | null
          pos_auto_update_stock?: boolean | null
          pos_branch_id?: string | null
          pos_call_center_enabled?: boolean
          pos_count?: number | null
          pos_day_cutoff_hour?: number | null
          pos_default_opening_balance?: number | null
          pos_deficit_alert?: boolean | null
          pos_deficit_threshold?: number | null
          pos_disable_cogs?: boolean
          pos_disable_stock_deduction?: boolean
          pos_kitchen_auto_print?: boolean | null
          pos_kitchen_ticket_size?: string | null
          pos_mode?: string
          pos_name?: string | null
          pos_payment_methods?: Json | null
          pos_prevent_zero_stock?: boolean | null
          pos_receipt_copies?: number | null
          pos_receipt_size?: string | null
          pos_require_cash_box?: boolean | null
          pos_require_device_fingerprint?: boolean | null
          pos_require_shift?: boolean | null
          pos_return_policy_days?: number | null
          pos_show_return_policy?: boolean | null
          pos_show_tax?: boolean | null
          pos_warn_out_of_stock?: boolean | null
          primary_color?: string | null
          print_decorative_ornaments?: boolean | null
          purchase_order_prefix?: string | null
          receipt_prefix?: string | null
          rep_allow_negative_stock?: boolean
          rep_disable_stock_deduction?: boolean
          reset_numbering_yearly?: boolean | null
          security_2fa_enabled?: boolean | null
          security_allowed_ips?: string | null
          security_audit_log?: boolean | null
          security_ip_restrict?: boolean | null
          security_lockout_enabled?: boolean | null
          security_max_attempts?: number | null
          security_new_device_alert?: boolean | null
          security_passkeys_enabled?: boolean | null
          security_session_timeout?: number | null
          security_warning_minutes?: number | null
          show_address_on_invoice?: boolean | null
          show_bank_on_invoice?: boolean | null
          show_logo_on_invoice?: boolean | null
          show_tax_on_invoice?: boolean | null
          tax_number?: string | null
          updated_at?: string | null
          updated_by?: string | null
          user_id: string
          vat_enabled?: boolean | null
          vat_inclusive?: boolean | null
          vat_purchases_account?: string | null
          vat_rate?: number | null
          vat_sales_account?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          allow_discount?: boolean | null
          allow_invoice_edit_after_approval?: boolean | null
          base_currency?: string | null
          business_type?: string | null
          calendar_type?: string | null
          can_delete_posted?: boolean | null
          can_edit_posted?: boolean | null
          card_bank_account_id?: string | null
          city?: string | null
          commercial_register?: string | null
          company_name?: string | null
          default_bank_account?: string | null
          default_cash_account?: string | null
          default_expense_account?: string | null
          default_invoice_currency?: string | null
          default_invoice_language?: string | null
          default_invoice_terms?: string | null
          default_payable_account?: string | null
          default_payment_terms?: string | null
          default_receivable_account?: string | null
          default_revenue_account?: string | null
          e_invoice_enabled?: boolean | null
          email?: string | null
          employee_count_range?: string | null
          exchange_rate_source?: string | null
          extra_currencies?: Json | null
          feature_flags?: Json
          fiscal_year_start?: number | null
          has_employees?: boolean | null
          has_pos?: boolean | null
          hidden_apps?: string[] | null
          hr_annual_leave_days?: number | null
          hr_carry_over_leave?: boolean | null
          hr_daily_hours?: number | null
          hr_late_grace_minutes?: number | null
          hr_require_gps?: boolean | null
          hr_require_qr?: boolean | null
          hr_salary_currency?: string | null
          hr_salary_day?: number | null
          hr_shift_end?: string | null
          hr_shift_start?: string | null
          hr_show_loan_form?: boolean | null
          hr_show_policies?: boolean | null
          hr_sick_leave_days?: number | null
          hr_social_security?: boolean | null
          hr_work_days_per_week?: number | null
          id?: string
          income_tax_enabled?: boolean | null
          income_tax_rate?: number | null
          inventory_allow_no_barcode?: boolean | null
          inventory_auto_barcode?: boolean | null
          inventory_costing_method?: string | null
          inventory_default_max_qty?: number | null
          inventory_default_min_qty?: number | null
          inventory_default_unit?: string | null
          inventory_expiry_alert?: boolean | null
          inventory_expiry_days?: number | null
          inventory_low_stock_alert?: boolean | null
          inventory_method?: string | null
          invoice_default_notes?: string | null
          invoice_font?: string | null
          invoice_footer?: string | null
          invoice_footer_message?: string | null
          invoice_header_layout?: string | null
          invoice_prefix?: string | null
          invoice_primary_color?: string | null
          invoice_show_amount_words?: boolean | null
          invoice_show_due_date?: boolean | null
          invoice_show_signature?: boolean | null
          invoice_show_tax_summary?: boolean | null
          journal_prefix?: string | null
          last_locked_period?: string | null
          licensed_dealer_number?: string | null
          logo_url?: string | null
          max_discount_percent?: number | null
          onboarding_completed?: boolean | null
          onboarding_completed_at?: string | null
          onboarding_skipped?: boolean | null
          onboarding_step?: number | null
          paper_size?: string | null
          payment_prefix?: string | null
          period_lock_mode?: string | null
          phone?: string | null
          phone2?: string | null
          pos_allow_order_transfer?: boolean | null
          pos_auto_print?: boolean | null
          pos_auto_update_stock?: boolean | null
          pos_branch_id?: string | null
          pos_call_center_enabled?: boolean
          pos_count?: number | null
          pos_day_cutoff_hour?: number | null
          pos_default_opening_balance?: number | null
          pos_deficit_alert?: boolean | null
          pos_deficit_threshold?: number | null
          pos_disable_cogs?: boolean
          pos_disable_stock_deduction?: boolean
          pos_kitchen_auto_print?: boolean | null
          pos_kitchen_ticket_size?: string | null
          pos_mode?: string
          pos_name?: string | null
          pos_payment_methods?: Json | null
          pos_prevent_zero_stock?: boolean | null
          pos_receipt_copies?: number | null
          pos_receipt_size?: string | null
          pos_require_cash_box?: boolean | null
          pos_require_device_fingerprint?: boolean | null
          pos_require_shift?: boolean | null
          pos_return_policy_days?: number | null
          pos_show_return_policy?: boolean | null
          pos_show_tax?: boolean | null
          pos_warn_out_of_stock?: boolean | null
          primary_color?: string | null
          print_decorative_ornaments?: boolean | null
          purchase_order_prefix?: string | null
          receipt_prefix?: string | null
          rep_allow_negative_stock?: boolean
          rep_disable_stock_deduction?: boolean
          reset_numbering_yearly?: boolean | null
          security_2fa_enabled?: boolean | null
          security_allowed_ips?: string | null
          security_audit_log?: boolean | null
          security_ip_restrict?: boolean | null
          security_lockout_enabled?: boolean | null
          security_max_attempts?: number | null
          security_new_device_alert?: boolean | null
          security_passkeys_enabled?: boolean | null
          security_session_timeout?: number | null
          security_warning_minutes?: number | null
          show_address_on_invoice?: boolean | null
          show_bank_on_invoice?: boolean | null
          show_logo_on_invoice?: boolean | null
          show_tax_on_invoice?: boolean | null
          tax_number?: string | null
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string
          vat_enabled?: boolean | null
          vat_inclusive?: boolean | null
          vat_purchases_account?: string | null
          vat_rate?: number | null
          vat_sales_account?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_card_bank_account_id_fkey"
            columns: ["card_bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      company_themes: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          logo_extracted_palette: string[] | null
          theme_colors: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          logo_extracted_palette?: string[] | null
          theme_colors?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          logo_extracted_palette?: string[] | null
          theme_colors?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      contact_alerts: {
        Row: {
          alert_type: string
          amount: number | null
          contact_id: string | null
          contact_name: string | null
          created_at: string | null
          days_overdue: number | null
          id: string
          is_read: boolean | null
          user_id: string
        }
        Insert: {
          alert_type: string
          amount?: number | null
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string | null
          days_overdue?: number | null
          id?: string
          is_read?: boolean | null
          user_id: string
        }
        Update: {
          alert_type?: string
          amount?: number | null
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string | null
          days_overdue?: number | null
          id?: string
          is_read?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_alerts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_class_policies: {
        Row: {
          class: string
          color: string | null
          created_at: string | null
          credit_limit_default: number | null
          description: string | null
          discount_pct: number | null
          followup_days: number | null
          id: string
          label: string | null
          payment_terms_days: number | null
          user_id: string
        }
        Insert: {
          class: string
          color?: string | null
          created_at?: string | null
          credit_limit_default?: number | null
          description?: string | null
          discount_pct?: number | null
          followup_days?: number | null
          id?: string
          label?: string | null
          payment_terms_days?: number | null
          user_id: string
        }
        Update: {
          class?: string
          color?: string | null
          created_at?: string | null
          credit_limit_default?: number | null
          description?: string | null
          discount_pct?: number | null
          followup_days?: number | null
          id?: string
          label?: string | null
          payment_terms_days?: number | null
          user_id?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          address: string | null
          archived_at: string | null
          archived_by: string | null
          avg_payment_days: number | null
          company_size: string | null
          contact_class: string | null
          contact_name: string
          contact_segment: string | null
          contact_type: string
          created_at: string
          created_from_order: boolean | null
          credit_limit: number | null
          current_balance: number | null
          early_pay_discount: number | null
          email: string | null
          id: string
          industry: string | null
          is_active: boolean | null
          is_archived: boolean | null
          last_transaction_date: string | null
          linked_account_code: string | null
          notes: string | null
          overdue_amount: number | null
          payment_terms_days: number | null
          phone: string | null
          purchase_limit: number | null
          sales_rep_id: string | null
          source: string | null
          tax_number: string | null
          total_paid: number | null
          total_purchases: number | null
          total_sales: number | null
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          archived_by?: string | null
          avg_payment_days?: number | null
          company_size?: string | null
          contact_class?: string | null
          contact_name: string
          contact_segment?: string | null
          contact_type?: string
          created_at?: string
          created_from_order?: boolean | null
          credit_limit?: number | null
          current_balance?: number | null
          early_pay_discount?: number | null
          email?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean | null
          is_archived?: boolean | null
          last_transaction_date?: string | null
          linked_account_code?: string | null
          notes?: string | null
          overdue_amount?: number | null
          payment_terms_days?: number | null
          phone?: string | null
          purchase_limit?: number | null
          sales_rep_id?: string | null
          source?: string | null
          tax_number?: string | null
          total_paid?: number | null
          total_purchases?: number | null
          total_sales?: number | null
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          archived_by?: string | null
          avg_payment_days?: number | null
          company_size?: string | null
          contact_class?: string | null
          contact_name?: string
          contact_segment?: string | null
          contact_type?: string
          created_at?: string
          created_from_order?: boolean | null
          credit_limit?: number | null
          current_balance?: number | null
          early_pay_discount?: number | null
          email?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean | null
          is_archived?: boolean | null
          last_transaction_date?: string | null
          linked_account_code?: string | null
          notes?: string | null
          overdue_amount?: number | null
          payment_terms_days?: number | null
          phone?: string | null
          purchase_limit?: number | null
          sales_rep_id?: string | null
          source?: string | null
          tax_number?: string | null
          total_paid?: number | null
          total_purchases?: number | null
          total_sales?: number | null
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      contractor_projects: {
        Row: {
          address: string | null
          budget: number | null
          client_name: string | null
          created_at: string | null
          end_date: string | null
          execution_duration: string | null
          id: string
          name: string
          notes: string | null
          payment_terms: string | null
          phone: string | null
          start_date: string | null
          status: string | null
          tasks: string[] | null
          total_expenses: number | null
          total_receipts: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          budget?: number | null
          client_name?: string | null
          created_at?: string | null
          end_date?: string | null
          execution_duration?: string | null
          id?: string
          name: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          start_date?: string | null
          status?: string | null
          tasks?: string[] | null
          total_expenses?: number | null
          total_receipts?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          budget?: number | null
          client_name?: string | null
          created_at?: string | null
          end_date?: string | null
          execution_duration?: string | null
          id?: string
          name?: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          start_date?: string | null
          status?: string | null
          tasks?: string[] | null
          total_expenses?: number | null
          total_receipts?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      contractor_transactions: {
        Row: {
          amount: number
          category: string | null
          cheque_date: string | null
          cheque_number: string | null
          cheque_status: string | null
          created_at: string | null
          description: string | null
          id: string
          linked_account_code: string | null
          notes: string | null
          payment_method: string | null
          project_id: string
          supplier: string | null
          transaction_date: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount?: number
          category?: string | null
          cheque_date?: string | null
          cheque_number?: string | null
          cheque_status?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          linked_account_code?: string | null
          notes?: string | null
          payment_method?: string | null
          project_id: string
          supplier?: string | null
          transaction_date?: string | null
          type?: string
          user_id: string
        }
        Update: {
          amount?: number
          category?: string | null
          cheque_date?: string | null
          cheque_number?: string | null
          cheque_status?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          linked_account_code?: string | null
          notes?: string | null
          payment_method?: string | null
          project_id?: string
          supplier?: string | null
          transaction_date?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_transactions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "contractor_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      correction_requests: {
        Row: {
          amount: number | null
          attendance_date: string
          attendance_day_id: string | null
          auth_user_id: string
          created_at: string
          employee_id: string
          id: string
          reason: string
          request_type: string
          requested_time: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          amount?: number | null
          attendance_date: string
          attendance_day_id?: string | null
          auth_user_id: string
          created_at?: string
          employee_id: string
          id?: string
          reason: string
          request_type: string
          requested_time?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          amount?: number | null
          attendance_date?: string
          attendance_day_id?: string | null
          auth_user_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          reason?: string
          request_type?: string
          requested_time?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "correction_requests_attendance_day_id_fkey"
            columns: ["attendance_day_id"]
            isOneToOne: false
            referencedRelation: "attendance_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "correction_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "correction_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_activities: {
        Row: {
          activity_type: Database["public"]["Enums"]["crm_activity_type"] | null
          assigned_to: string | null
          completed_at: string | null
          completion_notes: string | null
          contact_id: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          duration_minutes: number | null
          id: string
          lead_id: string | null
          opportunity_id: string | null
          outcome: string | null
          priority: Database["public"]["Enums"]["crm_priority"] | null
          scheduled_at: string | null
          status: Database["public"]["Enums"]["crm_activity_status"] | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          activity_type?:
            | Database["public"]["Enums"]["crm_activity_type"]
            | null
          assigned_to?: string | null
          completed_at?: string | null
          completion_notes?: string | null
          contact_id?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          duration_minutes?: number | null
          id?: string
          lead_id?: string | null
          opportunity_id?: string | null
          outcome?: string | null
          priority?: Database["public"]["Enums"]["crm_priority"] | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["crm_activity_status"] | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          activity_type?:
            | Database["public"]["Enums"]["crm_activity_type"]
            | null
          assigned_to?: string | null
          completed_at?: string | null
          completion_notes?: string | null
          contact_id?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          duration_minutes?: number | null
          id?: string
          lead_id?: string | null
          opportunity_id?: string | null
          outcome?: string | null
          priority?: Database["public"]["Enums"]["crm_priority"] | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["crm_activity_status"] | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "crm_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_leads: {
        Row: {
          assigned_to: string | null
          campaign: string | null
          city: string | null
          company_name: string | null
          contact_id: string | null
          contact_name: string | null
          converted_at: string | null
          converted_opportunity_id: string | null
          created_at: string | null
          currency: string | null
          email: string | null
          estimated_value: number | null
          id: string
          industry: string | null
          interested_products: string | null
          last_activity_date: string | null
          lost_reason: string | null
          mobile: string | null
          next_activity_date: string | null
          notes: string | null
          phone: string | null
          priority: Database["public"]["Enums"]["crm_priority"] | null
          probability: number | null
          region: string | null
          sales_team: string | null
          source: string | null
          source_details: string | null
          status: Database["public"]["Enums"]["crm_lead_status"] | null
          tags: string[] | null
          title: string
          updated_at: string | null
          user_id: string
          whatsapp: string | null
        }
        Insert: {
          assigned_to?: string | null
          campaign?: string | null
          city?: string | null
          company_name?: string | null
          contact_id?: string | null
          contact_name?: string | null
          converted_at?: string | null
          converted_opportunity_id?: string | null
          created_at?: string | null
          currency?: string | null
          email?: string | null
          estimated_value?: number | null
          id?: string
          industry?: string | null
          interested_products?: string | null
          last_activity_date?: string | null
          lost_reason?: string | null
          mobile?: string | null
          next_activity_date?: string | null
          notes?: string | null
          phone?: string | null
          priority?: Database["public"]["Enums"]["crm_priority"] | null
          probability?: number | null
          region?: string | null
          sales_team?: string | null
          source?: string | null
          source_details?: string | null
          status?: Database["public"]["Enums"]["crm_lead_status"] | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
          user_id: string
          whatsapp?: string | null
        }
        Update: {
          assigned_to?: string | null
          campaign?: string | null
          city?: string | null
          company_name?: string | null
          contact_id?: string | null
          contact_name?: string | null
          converted_at?: string | null
          converted_opportunity_id?: string | null
          created_at?: string | null
          currency?: string | null
          email?: string | null
          estimated_value?: number | null
          id?: string
          industry?: string | null
          interested_products?: string | null
          last_activity_date?: string | null
          lost_reason?: string | null
          mobile?: string | null
          next_activity_date?: string | null
          notes?: string | null
          phone?: string | null
          priority?: Database["public"]["Enums"]["crm_priority"] | null
          probability?: number | null
          region?: string | null
          sales_team?: string | null
          source?: string | null
          source_details?: string | null
          status?: Database["public"]["Enums"]["crm_lead_status"] | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          user_id?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_opportunities: {
        Row: {
          actual_close_date: string | null
          assigned_to: string | null
          contact_id: string | null
          converted_at: string | null
          converted_invoice_id: string | null
          created_at: string | null
          currency: string | null
          customer_name: string | null
          description: string | null
          expected_close_date: string | null
          expected_value: number | null
          id: string
          last_activity_date: string | null
          lead_id: string | null
          lost_at: string | null
          lost_reason: string | null
          next_activity_date: string | null
          notes: string | null
          priority: Database["public"]["Enums"]["crm_priority"] | null
          probability: number | null
          sales_team: string | null
          stage: Database["public"]["Enums"]["crm_opportunity_stage"] | null
          stage_changed_at: string | null
          stage_order: number | null
          tags: string[] | null
          title: string
          updated_at: string | null
          user_id: string
          weighted_value: number | null
          won_at: string | null
        }
        Insert: {
          actual_close_date?: string | null
          assigned_to?: string | null
          contact_id?: string | null
          converted_at?: string | null
          converted_invoice_id?: string | null
          created_at?: string | null
          currency?: string | null
          customer_name?: string | null
          description?: string | null
          expected_close_date?: string | null
          expected_value?: number | null
          id?: string
          last_activity_date?: string | null
          lead_id?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          next_activity_date?: string | null
          notes?: string | null
          priority?: Database["public"]["Enums"]["crm_priority"] | null
          probability?: number | null
          sales_team?: string | null
          stage?: Database["public"]["Enums"]["crm_opportunity_stage"] | null
          stage_changed_at?: string | null
          stage_order?: number | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
          user_id: string
          weighted_value?: number | null
          won_at?: string | null
        }
        Update: {
          actual_close_date?: string | null
          assigned_to?: string | null
          contact_id?: string | null
          converted_at?: string | null
          converted_invoice_id?: string | null
          created_at?: string | null
          currency?: string | null
          customer_name?: string | null
          description?: string | null
          expected_close_date?: string | null
          expected_value?: number | null
          id?: string
          last_activity_date?: string | null
          lead_id?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          next_activity_date?: string | null
          notes?: string | null
          priority?: Database["public"]["Enums"]["crm_priority"] | null
          probability?: number | null
          sales_team?: string | null
          stage?: Database["public"]["Enums"]["crm_opportunity_stage"] | null
          stage_changed_at?: string | null
          stage_order?: number | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          user_id?: string
          weighted_value?: number | null
          won_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_opportunities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_opportunities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_opportunity_stage_history: {
        Row: {
          changed_by: string | null
          created_at: string | null
          duration_in_previous_stage_seconds: number | null
          from_stage:
            | Database["public"]["Enums"]["crm_opportunity_stage"]
            | null
          id: string
          notes: string | null
          opportunity_id: string
          to_stage: Database["public"]["Enums"]["crm_opportunity_stage"]
          user_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string | null
          duration_in_previous_stage_seconds?: number | null
          from_stage?:
            | Database["public"]["Enums"]["crm_opportunity_stage"]
            | null
          id?: string
          notes?: string | null
          opportunity_id: string
          to_stage: Database["public"]["Enums"]["crm_opportunity_stage"]
          user_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string | null
          duration_in_previous_stage_seconds?: number | null
          from_stage?:
            | Database["public"]["Enums"]["crm_opportunity_stage"]
            | null
          id?: string
          notes?: string | null
          opportunity_id?: string
          to_stage?: Database["public"]["Enums"]["crm_opportunity_stage"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_opportunity_stage_history_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "crm_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      currencies: {
        Row: {
          code: string
          country_flag: string | null
          created_at: string
          decimal_places: number
          display_order: number | null
          id: string
          is_active: boolean
          is_base: boolean
          name_ar: string
          name_en: string | null
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          code: string
          country_flag?: string | null
          created_at?: string
          decimal_places?: number
          display_order?: number | null
          id?: string
          is_active?: boolean
          is_base?: boolean
          name_ar: string
          name_en?: string | null
          symbol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          code?: string
          country_flag?: string | null
          created_at?: string
          decimal_places?: number
          display_order?: number | null
          id?: string
          is_active?: boolean
          is_base?: boolean
          name_ar?: string
          name_en?: string | null
          symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      currency_conversions: {
        Row: {
          commission_account: string | null
          commission_amount: number | null
          conversion_date: string
          conversion_number: string | null
          created_at: string
          exchange_rate_used: number
          from_account: string | null
          from_amount: number
          from_currency_id: string
          gain_loss_amount: number | null
          id: string
          notes: string | null
          status: string
          to_account: string | null
          to_amount: number
          to_currency_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          commission_account?: string | null
          commission_amount?: number | null
          conversion_date?: string
          conversion_number?: string | null
          created_at?: string
          exchange_rate_used: number
          from_account?: string | null
          from_amount: number
          from_currency_id: string
          gain_loss_amount?: number | null
          id?: string
          notes?: string | null
          status?: string
          to_account?: string | null
          to_amount: number
          to_currency_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          commission_account?: string | null
          commission_amount?: number | null
          conversion_date?: string
          conversion_number?: string | null
          created_at?: string
          exchange_rate_used?: number
          from_account?: string | null
          from_amount?: number
          from_currency_id?: string
          gain_loss_amount?: number | null
          id?: string
          notes?: string | null
          status?: string
          to_account?: string | null
          to_amount?: number
          to_currency_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "currency_conversions_from_currency_id_fkey"
            columns: ["from_currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "currency_conversions_to_currency_id_fkey"
            columns: ["to_currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_cost_categories: {
        Row: {
          created_at: string
          icon: string
          id: string
          is_active: boolean
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          icon?: string
          id?: string
          is_active?: boolean
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          icon?: string
          id?: string
          is_active?: boolean
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      custom_dashboards: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_default: boolean | null
          is_shared: boolean | null
          layout_config: Json | null
          name: string
          share_token: string | null
          shared_at: string | null
          sort_order: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean | null
          is_shared?: boolean | null
          layout_config?: Json | null
          name: string
          share_token?: string | null
          shared_at?: string | null
          sort_order?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean | null
          is_shared?: boolean | null
          layout_config?: Json | null
          name?: string
          share_token?: string | null
          shared_at?: string | null
          sort_order?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      custom_report_versions: {
        Row: {
          change_note: string | null
          created_at: string
          id: string
          report_id: string
          snapshot: Json
          user_id: string
          version_number: number
        }
        Insert: {
          change_note?: string | null
          created_at?: string
          id?: string
          report_id: string
          snapshot: Json
          user_id: string
          version_number: number
        }
        Update: {
          change_note?: string | null
          created_at?: string
          id?: string
          report_id?: string
          snapshot?: Json
          user_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "custom_report_versions_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "custom_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_reports: {
        Row: {
          archived_at: string | null
          chart_type: string | null
          color: string | null
          columns: Json
          created_at: string
          data_source: string
          description: string | null
          filters: Json
          folder_id: string | null
          group_by: string | null
          icon: string | null
          id: string
          is_archived: boolean
          is_favorite: boolean
          is_shared: boolean
          last_used_at: string | null
          name: string
          sort_by: Json | null
          updated_at: string
          use_count: number
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          chart_type?: string | null
          color?: string | null
          columns?: Json
          created_at?: string
          data_source: string
          description?: string | null
          filters?: Json
          folder_id?: string | null
          group_by?: string | null
          icon?: string | null
          id?: string
          is_archived?: boolean
          is_favorite?: boolean
          is_shared?: boolean
          last_used_at?: string | null
          name: string
          sort_by?: Json | null
          updated_at?: string
          use_count?: number
          user_id: string
        }
        Update: {
          archived_at?: string | null
          chart_type?: string | null
          color?: string | null
          columns?: Json
          created_at?: string
          data_source?: string
          description?: string | null
          filters?: Json
          folder_id?: string | null
          group_by?: string | null
          icon?: string | null
          id?: string
          is_archived?: boolean
          is_favorite?: boolean
          is_shared?: boolean
          last_used_at?: string | null
          name?: string
          sort_by?: Json | null
          updated_at?: string
          use_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_reports_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "report_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_workshop_types: {
        Row: {
          created_at: string
          icon: string
          id: string
          is_active: boolean
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          icon?: string
          id?: string
          is_active?: boolean
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          icon?: string
          id?: string
          is_active?: boolean
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      customer_surveys: {
        Row: {
          cashier_user_id: string | null
          comment: string | null
          completed_at: string | null
          created_at: string | null
          customer_id: string | null
          expires_at: string | null
          id: string
          opened_at: string | null
          order_id: string | null
          overall_rating: number | null
          product_rating: number | null
          recommend: boolean | null
          sent_at: string | null
          service_rating: number | null
          status: string | null
          survey_age_group: string | null
          survey_gender: string | null
          survey_nationality: string | null
          survey_token: string
          user_id: string
        }
        Insert: {
          cashier_user_id?: string | null
          comment?: string | null
          completed_at?: string | null
          created_at?: string | null
          customer_id?: string | null
          expires_at?: string | null
          id?: string
          opened_at?: string | null
          order_id?: string | null
          overall_rating?: number | null
          product_rating?: number | null
          recommend?: boolean | null
          sent_at?: string | null
          service_rating?: number | null
          status?: string | null
          survey_age_group?: string | null
          survey_gender?: string | null
          survey_nationality?: string | null
          survey_token: string
          user_id: string
        }
        Update: {
          cashier_user_id?: string | null
          comment?: string | null
          completed_at?: string | null
          created_at?: string | null
          customer_id?: string | null
          expires_at?: string | null
          id?: string
          opened_at?: string | null
          order_id?: string | null
          overall_rating?: number | null
          product_rating?: number | null
          recommend?: boolean | null
          sent_at?: string | null
          service_rating?: number | null
          status?: string | null
          survey_age_group?: string | null
          survey_gender?: string | null
          survey_nationality?: string | null
          survey_token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_surveys_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pos_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_surveys_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "pos_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_roster: {
        Row: {
          branch_id: string
          company_id: string
          created_at: string
          created_by: string | null
          employee_id: string
          end_time: string | null
          id: string
          notes: string | null
          roster_date: string
          shift_template_id: string | null
          start_time: string | null
          status: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          employee_id: string
          end_time?: string | null
          id?: string
          notes?: string | null
          roster_date: string
          shift_template_id?: string | null
          start_time?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          employee_id?: string
          end_time?: string | null
          id?: string
          notes?: string | null
          roster_date?: string
          shift_template_id?: string | null
          start_time?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_roster_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_roster_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_roster_shift_template_id_fkey"
            columns: ["shift_template_id"]
            isOneToOne: false
            referencedRelation: "shift_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_widgets: {
        Row: {
          config: Json
          created_at: string
          dashboard_id: string
          height: number
          id: string
          pos_x: number
          pos_y: number
          title: string | null
          updated_at: string
          user_id: string
          widget_type: string
          width: number
        }
        Insert: {
          config?: Json
          created_at?: string
          dashboard_id: string
          height?: number
          id?: string
          pos_x?: number
          pos_y?: number
          title?: string | null
          updated_at?: string
          user_id: string
          widget_type: string
          width?: number
        }
        Update: {
          config?: Json
          created_at?: string
          dashboard_id?: string
          height?: number
          id?: string
          pos_x?: number
          pos_y?: number
          title?: string | null
          updated_at?: string
          user_id?: string
          widget_type?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_widgets_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "custom_dashboards"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_apps: {
        Row: {
          created_at: string | null
          display_order: number | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          user_id: string
          visa_gl_account_code: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          user_id: string
          visa_gl_account_code?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          user_id?: string
          visa_gl_account_code?: string | null
        }
        Relationships: []
      }
      delivery_note_items: {
        Row: {
          delivery_note_id: string
          id: string
          notes: string | null
          product_id: string | null
          product_name: string
          quantity: number
          sort_order: number | null
          total: number | null
          unit: string | null
          unit_price: number | null
        }
        Insert: {
          delivery_note_id: string
          id?: string
          notes?: string | null
          product_id?: string | null
          product_name: string
          quantity?: number
          sort_order?: number | null
          total?: number | null
          unit?: string | null
          unit_price?: number | null
        }
        Update: {
          delivery_note_id?: string
          id?: string
          notes?: string | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          sort_order?: number | null
          total?: number | null
          unit?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_note_items_delivery_note_id_fkey"
            columns: ["delivery_note_id"]
            isOneToOne: false
            referencedRelation: "delivery_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_note_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_warehouse_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "delivery_note_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_notes: {
        Row: {
          contact_id: string | null
          contact_name: string | null
          converted_at: string | null
          created_at: string
          currency: string | null
          delivery_address: string | null
          delivery_date: string
          delivery_number: string | null
          discount: number | null
          driver_name: string | null
          exchange_rate: number | null
          id: string
          invoice_number: string | null
          linked_invoice_id: string | null
          notes: string | null
          status: string
          subtotal: number | null
          total_amount: number | null
          updated_at: string
          user_id: string
          vat_amount: number | null
          vehicle_number: string | null
        }
        Insert: {
          contact_id?: string | null
          contact_name?: string | null
          converted_at?: string | null
          created_at?: string
          currency?: string | null
          delivery_address?: string | null
          delivery_date?: string
          delivery_number?: string | null
          discount?: number | null
          driver_name?: string | null
          exchange_rate?: number | null
          id?: string
          invoice_number?: string | null
          linked_invoice_id?: string | null
          notes?: string | null
          status?: string
          subtotal?: number | null
          total_amount?: number | null
          updated_at?: string
          user_id: string
          vat_amount?: number | null
          vehicle_number?: string | null
        }
        Update: {
          contact_id?: string | null
          contact_name?: string | null
          converted_at?: string | null
          created_at?: string
          currency?: string | null
          delivery_address?: string | null
          delivery_date?: string
          delivery_number?: string | null
          discount?: number | null
          driver_name?: string | null
          exchange_rate?: number | null
          id?: string
          invoice_number?: string | null
          linked_invoice_id?: string | null
          notes?: string | null
          status?: string
          subtotal?: number | null
          total_amount?: number | null
          updated_at?: string
          user_id?: string
          vat_amount?: number | null
          vehicle_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_notes_linked_invoice_id_fkey"
            columns: ["linked_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_notes_linked_invoice_id_fkey"
            columns: ["linked_invoice_id"]
            isOneToOne: false
            referencedRelation: "v_drift_invoice_no_link"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          code: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_deleted: boolean
          name: string
          name_ar: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          name: string
          name_ar?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          name?: string
          name_ar?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      document_edit_history: {
        Row: {
          changes: Json | null
          document_id: string
          document_type: string
          edit_reason: string | null
          edited_at: string | null
          edited_by: string
          id: string
          new_data: Json | null
          old_data: Json | null
          user_id: string
        }
        Insert: {
          changes?: Json | null
          document_id: string
          document_type: string
          edit_reason?: string | null
          edited_at?: string | null
          edited_by: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          user_id: string
        }
        Update: {
          changes?: Json | null
          document_id?: string
          document_type?: string
          edit_reason?: string | null
          edited_at?: string | null
          edited_by?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      document_sequences: {
        Row: {
          doc_type: string
          last_number: number
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          doc_type: string
          last_number?: number
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          doc_type?: string
          last_number?: number
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      employee_advance_installments: {
        Row: {
          advance_id: string
          amount: number
          created_at: string
          deducted_at: string | null
          due_month: string
          employee_id: string
          id: string
          installment_number: number
          payslip_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          advance_id: string
          amount: number
          created_at?: string
          deducted_at?: string | null
          due_month: string
          employee_id: string
          id?: string
          installment_number: number
          payslip_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          advance_id?: string
          amount?: number
          created_at?: string
          deducted_at?: string | null
          due_month?: string
          employee_id?: string
          id?: string
          installment_number?: number
          payslip_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_advance_installments_advance_id_fkey"
            columns: ["advance_id"]
            isOneToOne: false
            referencedRelation: "employee_advances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_advance_installments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_advance_installments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_advances: {
        Row: {
          advance_type: string
          amount: number
          approved_by: string | null
          approved_date: string | null
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          installment_amount: number | null
          installments_count: number
          notes: string | null
          payment_date: string | null
          payment_method: string | null
          request_date: string
          start_deduction_month: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          advance_type?: string
          amount: number
          approved_by?: string | null
          approved_date?: string | null
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          installment_amount?: number | null
          installments_count?: number
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          request_date?: string
          start_deduction_month?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          advance_type?: string
          amount?: number
          approved_by?: string | null
          approved_date?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          installment_amount?: number | null
          installments_count?: number
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          request_date?: string
          start_deduction_month?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_advances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_advances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_allowances: {
        Row: {
          activation_date: string | null
          activation_months: number | null
          allowance_name: string
          allowance_type: string
          amount: number
          amount_per_day: number | null
          created_at: string
          employee_id: string
          fixed_amount: number | null
          id: string
          is_active: boolean
          notes: string | null
          percentage: number | null
          user_id: string
        }
        Insert: {
          activation_date?: string | null
          activation_months?: number | null
          allowance_name: string
          allowance_type?: string
          amount?: number
          amount_per_day?: number | null
          created_at?: string
          employee_id: string
          fixed_amount?: number | null
          id?: string
          is_active?: boolean
          notes?: string | null
          percentage?: number | null
          user_id: string
        }
        Update: {
          activation_date?: string | null
          activation_months?: number | null
          allowance_name?: string
          allowance_type?: string
          amount?: number
          amount_per_day?: number | null
          created_at?: string
          employee_id?: string
          fixed_amount?: number | null
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
          {
            foreignKeyName: "employee_allowances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_component_values: {
        Row: {
          company_id: string
          component_id: string
          created_at: string
          effective_from: string
          effective_to: string | null
          employee_id: string
          id: string
          updated_at: string
          value: number
        }
        Insert: {
          company_id: string
          component_id: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          employee_id: string
          id?: string
          updated_at?: string
          value: number
        }
        Update: {
          company_id?: string
          component_id?: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          employee_id?: string
          id?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_component_values_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "hr_payroll_components"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_deductions: {
        Row: {
          amount: number
          created_at: string
          deduction_date: string
          deduction_month: string | null
          deduction_type: string
          description: string | null
          employee_id: string
          id: string
          is_repaid: boolean
          notes: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          deduction_date?: string
          deduction_month?: string | null
          deduction_type: string
          description?: string | null
          employee_id: string
          id?: string
          is_repaid?: boolean
          notes?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          deduction_date?: string
          deduction_month?: string | null
          deduction_type?: string
          description?: string | null
          employee_id?: string
          id?: string
          is_repaid?: boolean
          notes?: string | null
          status?: string | null
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
          {
            foreignKeyName: "employee_deductions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_financial_movements: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          category: string | null
          created_at: string
          created_by: string | null
          description: string
          employee_id: string
          id: string
          journal_entry_id: string | null
          movement_date: string
          movement_type: string
          notes: string | null
          reference_number: string | null
          salary_month: number | null
          salary_year: number | null
          source_id: string | null
          source_reference: string | null
          source_type: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          employee_id: string
          id?: string
          journal_entry_id?: string | null
          movement_date?: string
          movement_type: string
          notes?: string | null
          reference_number?: string | null
          salary_month?: number | null
          salary_year?: number | null
          source_id?: string | null
          source_reference?: string | null
          source_type: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          employee_id?: string
          id?: string
          journal_entry_id?: string | null
          movement_date?: string
          movement_type?: string
          notes?: string | null
          reference_number?: string | null
          salary_month?: number | null
          salary_year?: number | null
          source_id?: string | null
          source_reference?: string | null
          source_type?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_financial_movements_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_financial_movements_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_forms: {
        Row: {
          attachment_url: string | null
          created_at: string
          employee_id: string
          form_data: Json
          form_type: string
          id: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attachment_url?: string | null
          created_at?: string
          employee_id: string
          form_data?: Json
          form_type: string
          id?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attachment_url?: string | null
          created_at?: string
          employee_id?: string
          form_data?: Json
          form_type?: string
          id?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_forms_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_forms_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_hr_records: {
        Row: {
          action_taken: string | null
          amount: number | null
          created_at: string
          created_by: string | null
          description: string | null
          employee_id: string
          id: string
          period: string | null
          rating: number | null
          record_date: string
          record_type: string
          title: string | null
          user_id: string
        }
        Insert: {
          action_taken?: string | null
          amount?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          employee_id: string
          id?: string
          period?: string | null
          rating?: number | null
          record_date?: string
          record_type: string
          title?: string | null
          user_id: string
        }
        Update: {
          action_taken?: string | null
          amount?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          employee_id?: string
          id?: string
          period?: string | null
          rating?: number | null
          record_date?: string
          record_type?: string
          title?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_hr_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_hr_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
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
          {
            foreignKeyName: "employee_leaves_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_loans: {
        Row: {
          approval_date: string | null
          approved_by: string | null
          company_id: string | null
          created_at: string | null
          employee_id: string
          first_payment_date: string
          id: string
          last_payment_date: string
          monthly_installment: number
          notes: string | null
          paid_months: number | null
          remaining_amount: number
          status: string | null
          total_amount: number
          total_months: number
          user_id: string
        }
        Insert: {
          approval_date?: string | null
          approved_by?: string | null
          company_id?: string | null
          created_at?: string | null
          employee_id: string
          first_payment_date: string
          id?: string
          last_payment_date: string
          monthly_installment: number
          notes?: string | null
          paid_months?: number | null
          remaining_amount: number
          status?: string | null
          total_amount: number
          total_months: number
          user_id: string
        }
        Update: {
          approval_date?: string | null
          approved_by?: string | null
          company_id?: string | null
          created_at?: string | null
          employee_id?: string
          first_payment_date?: string
          id?: string
          last_payment_date?: string
          monthly_installment?: number
          notes?: string | null
          paid_months?: number | null
          remaining_amount?: number
          status?: string | null
          total_amount?: number
          total_months?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_loans_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_loans_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_loans_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_payroll: {
        Row: {
          admin_allowance: number | null
          annual_allowance: number | null
          approval_snapshot: Json | null
          approved_at: string | null
          approved_by: string | null
          attendance_bonus: number | null
          attendance_salary: number | null
          base_salary: number
          batch_id: string | null
          carry_over_balance: number | null
          company_id: string | null
          created_at: string
          deduction_cash_advance: number | null
          deduction_cash_shortage: number | null
          deduction_delivery: number | null
          deduction_fixed_component: number | null
          deduction_food_group: number | null
          deduction_food_individual: number | null
          deduction_loan: number | null
          deduction_new_advance: number | null
          deduction_opening_balance: number | null
          deduction_other: number | null
          deduction_purchases: number | null
          deduction_violations: number | null
          employee_id: string
          entitlements: number | null
          extra_work_allowance: number | null
          family_allowance: number | null
          food_transport_net: number | null
          id: string
          is_paid: boolean
          linked_transaction_id: string | null
          net_salary: number
          notes: string | null
          other_allowances_val: number | null
          overtime_hours_val: number | null
          paid_date: string | null
          payment_method: string | null
          period_month: number
          period_year: number
          regular_hours: number | null
          rejection_reason: string | null
          special_allowance: number | null
          status: Database["public"]["Enums"]["payroll_status"]
          submitted_at: string | null
          submitted_by: string | null
          total_allowances: number
          total_deductions: number
          total_overtime: number
          user_id: string
          vacation_hours_paid: number | null
          voucher_id: string | null
          working_days: number | null
        }
        Insert: {
          admin_allowance?: number | null
          annual_allowance?: number | null
          approval_snapshot?: Json | null
          approved_at?: string | null
          approved_by?: string | null
          attendance_bonus?: number | null
          attendance_salary?: number | null
          base_salary?: number
          batch_id?: string | null
          carry_over_balance?: number | null
          company_id?: string | null
          created_at?: string
          deduction_cash_advance?: number | null
          deduction_cash_shortage?: number | null
          deduction_delivery?: number | null
          deduction_fixed_component?: number | null
          deduction_food_group?: number | null
          deduction_food_individual?: number | null
          deduction_loan?: number | null
          deduction_new_advance?: number | null
          deduction_opening_balance?: number | null
          deduction_other?: number | null
          deduction_purchases?: number | null
          deduction_violations?: number | null
          employee_id: string
          entitlements?: number | null
          extra_work_allowance?: number | null
          family_allowance?: number | null
          food_transport_net?: number | null
          id?: string
          is_paid?: boolean
          linked_transaction_id?: string | null
          net_salary?: number
          notes?: string | null
          other_allowances_val?: number | null
          overtime_hours_val?: number | null
          paid_date?: string | null
          payment_method?: string | null
          period_month: number
          period_year: number
          regular_hours?: number | null
          rejection_reason?: string | null
          special_allowance?: number | null
          status?: Database["public"]["Enums"]["payroll_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          total_allowances?: number
          total_deductions?: number
          total_overtime?: number
          user_id: string
          vacation_hours_paid?: number | null
          voucher_id?: string | null
          working_days?: number | null
        }
        Update: {
          admin_allowance?: number | null
          annual_allowance?: number | null
          approval_snapshot?: Json | null
          approved_at?: string | null
          approved_by?: string | null
          attendance_bonus?: number | null
          attendance_salary?: number | null
          base_salary?: number
          batch_id?: string | null
          carry_over_balance?: number | null
          company_id?: string | null
          created_at?: string
          deduction_cash_advance?: number | null
          deduction_cash_shortage?: number | null
          deduction_delivery?: number | null
          deduction_fixed_component?: number | null
          deduction_food_group?: number | null
          deduction_food_individual?: number | null
          deduction_loan?: number | null
          deduction_new_advance?: number | null
          deduction_opening_balance?: number | null
          deduction_other?: number | null
          deduction_purchases?: number | null
          deduction_violations?: number | null
          employee_id?: string
          entitlements?: number | null
          extra_work_allowance?: number | null
          family_allowance?: number | null
          food_transport_net?: number | null
          id?: string
          is_paid?: boolean
          linked_transaction_id?: string | null
          net_salary?: number
          notes?: string | null
          other_allowances_val?: number | null
          overtime_hours_val?: number | null
          paid_date?: string | null
          payment_method?: string | null
          period_month?: number
          period_year?: number
          regular_hours?: number | null
          rejection_reason?: string | null
          special_allowance?: number | null
          status?: Database["public"]["Enums"]["payroll_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          total_allowances?: number
          total_deductions?: number
          total_overtime?: number
          user_id?: string
          vacation_hours_paid?: number | null
          voucher_id?: string | null
          working_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_payroll_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_payroll_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_payroll_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_payroll_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_payroll_profile: {
        Row: {
          basic_salary: number
          company_id: string
          created_at: string
          effective_from: string | null
          employee_id: string
          id: string
          notes: string | null
          overrides: Json
          policy_id: string
          updated_at: string
        }
        Insert: {
          basic_salary?: number
          company_id: string
          created_at?: string
          effective_from?: string | null
          employee_id: string
          id?: string
          notes?: string | null
          overrides?: Json
          policy_id: string
          updated_at?: string
        }
        Update: {
          basic_salary?: number
          company_id?: string
          created_at?: string
          effective_from?: string | null
          employee_id?: string
          id?: string
          notes?: string | null
          overrides?: Json
          policy_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_payroll_profile_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "hr_payroll_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_policy_documents: {
        Row: {
          category: string
          created_at: string
          description: string | null
          file_url: string
          id: string
          is_active: boolean
          title: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          file_url: string
          id?: string
          is_active?: boolean
          title: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          file_url?: string
          id?: string
          is_active?: boolean
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          address: string | null
          admin_allowance: number | null
          annual_leave_balance: number | null
          annual_leave_days: number
          auth_user_id: string | null
          bank_account: string | null
          bank_name: string | null
          base_salary: number
          branch_id: string | null
          can_manage_attendance: boolean
          can_manage_schedule: boolean
          can_view_team: boolean
          child_allowance_per_child: number | null
          children_count: number | null
          company_id: string
          contract_type: string | null
          created_at: string
          date_of_birth: string | null
          department: string | null
          department_id: string | null
          email: string | null
          emergency_contact: string | null
          emergency_phone: string | null
          employee_number: string | null
          end_date: string | null
          fingerprint_id: number | null
          food_transport_override: number | null
          full_name: string
          gender: string | null
          hourly_rate: number
          id: string
          id_number: string | null
          is_active: boolean
          is_hr_manager: boolean
          is_manager: boolean
          is_terminated: boolean | null
          job_title: string | null
          job_title_id: string | null
          manager_employee_id: string | null
          marital_status: string | null
          meal_allowance_per_day: number | null
          nationality: string | null
          notes: string | null
          opening_balance: number | null
          opening_balance_date: string | null
          opening_balance_type: string | null
          other_allowances: number | null
          payroll_overrides: Json
          payroll_policy_id: string | null
          phone: string | null
          photo_url: string | null
          position: string | null
          previous_year_balance: number | null
          salary_type: string
          shift_end: string | null
          shift_id: string | null
          shift_start: string | null
          sick_leave_days: number
          special_work_allowance: number | null
          spouse_allowance_amount: number | null
          start_date: string
          terminated_at: string | null
          termination_reason: string | null
          transfer_allowance: number | null
          transportation_allowance_per_day: number | null
          updated_at: string
          user_id: string
          wives_count: number | null
          work_days_per_week: number
          work_hours_per_day: number
        }
        Insert: {
          address?: string | null
          admin_allowance?: number | null
          annual_leave_balance?: number | null
          annual_leave_days?: number
          auth_user_id?: string | null
          bank_account?: string | null
          bank_name?: string | null
          base_salary?: number
          branch_id?: string | null
          can_manage_attendance?: boolean
          can_manage_schedule?: boolean
          can_view_team?: boolean
          child_allowance_per_child?: number | null
          children_count?: number | null
          company_id: string
          contract_type?: string | null
          created_at?: string
          date_of_birth?: string | null
          department?: string | null
          department_id?: string | null
          email?: string | null
          emergency_contact?: string | null
          emergency_phone?: string | null
          employee_number?: string | null
          end_date?: string | null
          fingerprint_id?: number | null
          food_transport_override?: number | null
          full_name: string
          gender?: string | null
          hourly_rate?: number
          id?: string
          id_number?: string | null
          is_active?: boolean
          is_hr_manager?: boolean
          is_manager?: boolean
          is_terminated?: boolean | null
          job_title?: string | null
          job_title_id?: string | null
          manager_employee_id?: string | null
          marital_status?: string | null
          meal_allowance_per_day?: number | null
          nationality?: string | null
          notes?: string | null
          opening_balance?: number | null
          opening_balance_date?: string | null
          opening_balance_type?: string | null
          other_allowances?: number | null
          payroll_overrides?: Json
          payroll_policy_id?: string | null
          phone?: string | null
          photo_url?: string | null
          position?: string | null
          previous_year_balance?: number | null
          salary_type?: string
          shift_end?: string | null
          shift_id?: string | null
          shift_start?: string | null
          sick_leave_days?: number
          special_work_allowance?: number | null
          spouse_allowance_amount?: number | null
          start_date?: string
          terminated_at?: string | null
          termination_reason?: string | null
          transfer_allowance?: number | null
          transportation_allowance_per_day?: number | null
          updated_at?: string
          user_id: string
          wives_count?: number | null
          work_days_per_week?: number
          work_hours_per_day?: number
        }
        Update: {
          address?: string | null
          admin_allowance?: number | null
          annual_leave_balance?: number | null
          annual_leave_days?: number
          auth_user_id?: string | null
          bank_account?: string | null
          bank_name?: string | null
          base_salary?: number
          branch_id?: string | null
          can_manage_attendance?: boolean
          can_manage_schedule?: boolean
          can_view_team?: boolean
          child_allowance_per_child?: number | null
          children_count?: number | null
          company_id?: string
          contract_type?: string | null
          created_at?: string
          date_of_birth?: string | null
          department?: string | null
          department_id?: string | null
          email?: string | null
          emergency_contact?: string | null
          emergency_phone?: string | null
          employee_number?: string | null
          end_date?: string | null
          fingerprint_id?: number | null
          food_transport_override?: number | null
          full_name?: string
          gender?: string | null
          hourly_rate?: number
          id?: string
          id_number?: string | null
          is_active?: boolean
          is_hr_manager?: boolean
          is_manager?: boolean
          is_terminated?: boolean | null
          job_title?: string | null
          job_title_id?: string | null
          manager_employee_id?: string | null
          marital_status?: string | null
          meal_allowance_per_day?: number | null
          nationality?: string | null
          notes?: string | null
          opening_balance?: number | null
          opening_balance_date?: string | null
          opening_balance_type?: string | null
          other_allowances?: number | null
          payroll_overrides?: Json
          payroll_policy_id?: string | null
          phone?: string | null
          photo_url?: string | null
          position?: string | null
          previous_year_balance?: number | null
          salary_type?: string
          shift_end?: string | null
          shift_id?: string | null
          shift_start?: string | null
          sick_leave_days?: number
          special_work_allowance?: number | null
          spouse_allowance_amount?: number | null
          start_date?: string
          terminated_at?: string | null
          termination_reason?: string | null
          transfer_allowance?: number | null
          transportation_allowance_per_day?: number | null
          updated_at?: string
          user_id?: string
          wives_count?: number | null
          work_days_per_week?: number
          work_hours_per_day?: number
        }
        Relationships: [
          {
            foreignKeyName: "employees_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_job_title_id_fkey"
            columns: ["job_title_id"]
            isOneToOne: false
            referencedRelation: "job_titles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_manager_employee_id_fkey"
            columns: ["manager_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_manager_employee_id_fkey"
            columns: ["manager_employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_payroll_policy_id_fkey"
            columns: ["payroll_policy_id"]
            isOneToOne: false
            referencedRelation: "hr_payroll_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "work_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          allow_pos_edit: boolean | null
          buy_rate: number
          created_at: string
          currency_id: string
          id: string
          mid_rate: number
          notes: string | null
          pos_rate_override: number | null
          rate_date: string
          sell_rate: number
          source: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          allow_pos_edit?: boolean | null
          buy_rate?: number
          created_at?: string
          currency_id: string
          id?: string
          mid_rate?: number
          notes?: string | null
          pos_rate_override?: number | null
          rate_date?: string
          sell_rate?: number
          source?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          allow_pos_edit?: boolean | null
          buy_rate?: number
          created_at?: string
          currency_id?: string
          id?: string
          mid_rate?: number
          notes?: string | null
          pos_rate_override?: number | null
          rate_date?: string
          sell_rate?: number
          source?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_rates_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_claims: {
        Row: {
          amount: number
          amount_text: string | null
          claim_date: string | null
          claim_number: string | null
          created_at: string | null
          custom_note: string | null
          due_date: string | null
          id: string
          project_id: string | null
          recipient_address: string | null
          recipient_name: string
          reply_days: number | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          amount_text?: string | null
          claim_date?: string | null
          claim_number?: string | null
          created_at?: string | null
          custom_note?: string | null
          due_date?: string | null
          id?: string
          project_id?: string | null
          recipient_address?: string | null
          recipient_name: string
          reply_days?: number | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          amount_text?: string | null
          claim_date?: string | null
          claim_number?: string | null
          created_at?: string | null
          custom_note?: string | null
          due_date?: string | null
          id?: string
          project_id?: string | null
          recipient_address?: string | null
          recipient_name?: string
          reply_days?: number | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_claims_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "contractor_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_periods: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          end_date: string
          id: string
          notes: string | null
          period_name: string
          start_date: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          end_date: string
          id?: string
          notes?: string | null
          period_name: string
          start_date: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          end_date?: string
          id?: string
          notes?: string | null
          period_name?: string
          start_date?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      generated_reports: {
        Row: {
          created_at: string
          created_by: string | null
          data: Json | null
          id: string
          pdf_url: string | null
          period_end: string
          period_start: string
          period_type: string
          report_type: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: Json | null
          id?: string
          pdf_url?: string | null
          period_end: string
          period_start: string
          period_type?: string
          report_type?: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: Json | null
          id?: string
          pdf_url?: string | null
          period_end?: string
          period_start?: string
          period_type?: string
          report_type?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      hr_attendance_locks: {
        Row: {
          attendance_date: string
          auth_user_id: string
          branch_id: string | null
          created_at: string
          id: string
          locked_at: string
          locked_by: string
          reason: string | null
          status: string
          unlock_reason: string | null
          unlocked_at: string | null
          unlocked_by: string | null
          updated_at: string
        }
        Insert: {
          attendance_date: string
          auth_user_id: string
          branch_id?: string | null
          created_at?: string
          id?: string
          locked_at?: string
          locked_by: string
          reason?: string | null
          status?: string
          unlock_reason?: string | null
          unlocked_at?: string | null
          unlocked_by?: string | null
          updated_at?: string
        }
        Update: {
          attendance_date?: string
          auth_user_id?: string
          branch_id?: string | null
          created_at?: string
          id?: string
          locked_at?: string
          locked_by?: string
          reason?: string | null
          status?: string
          unlock_reason?: string | null
          unlocked_at?: string | null
          unlocked_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_attendance_locks_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_attendance_locks_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_day_types: {
        Row: {
          affects_salary: boolean
          category: string
          code: string
          color: string
          counts_as_attendance: boolean
          created_at: string
          id: string
          is_active: boolean
          is_paid: boolean
          is_system: boolean
          name: string
          notes: string | null
          requires_approval: boolean
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          affects_salary?: boolean
          category?: string
          code: string
          color?: string
          counts_as_attendance?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          is_paid?: boolean
          is_system?: boolean
          name: string
          notes?: string | null
          requires_approval?: boolean
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          affects_salary?: boolean
          category?: string
          code?: string
          color?: string
          counts_as_attendance?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          is_paid?: boolean
          is_system?: boolean
          name?: string
          notes?: string | null
          requires_approval?: boolean
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      hr_manager_permissions: {
        Row: {
          can_add_employees: boolean | null
          can_approve_leaves: boolean | null
          can_approve_payroll: boolean | null
          can_approve_requests: boolean | null
          can_delete_employees: boolean | null
          can_edit_attendance: boolean | null
          can_edit_employees: boolean | null
          can_export_hr_data: boolean | null
          can_manage_advances: boolean | null
          can_manage_attendance: boolean | null
          can_manage_branches: boolean | null
          can_manage_deductions: boolean | null
          can_manage_forms: boolean | null
          can_manage_holidays: boolean | null
          can_manage_hr_settings: boolean | null
          can_manage_leave_policy: boolean | null
          can_manage_loans: boolean | null
          can_process_payroll: boolean | null
          can_view_hr_reports: boolean | null
          can_view_salary_info: boolean | null
          created_at: string | null
          email: string
          full_name: string
          hr_auth_id: string
          id: string
          is_active: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          can_add_employees?: boolean | null
          can_approve_leaves?: boolean | null
          can_approve_payroll?: boolean | null
          can_approve_requests?: boolean | null
          can_delete_employees?: boolean | null
          can_edit_attendance?: boolean | null
          can_edit_employees?: boolean | null
          can_export_hr_data?: boolean | null
          can_manage_advances?: boolean | null
          can_manage_attendance?: boolean | null
          can_manage_branches?: boolean | null
          can_manage_deductions?: boolean | null
          can_manage_forms?: boolean | null
          can_manage_holidays?: boolean | null
          can_manage_hr_settings?: boolean | null
          can_manage_leave_policy?: boolean | null
          can_manage_loans?: boolean | null
          can_process_payroll?: boolean | null
          can_view_hr_reports?: boolean | null
          can_view_salary_info?: boolean | null
          created_at?: string | null
          email: string
          full_name: string
          hr_auth_id: string
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          can_add_employees?: boolean | null
          can_approve_leaves?: boolean | null
          can_approve_payroll?: boolean | null
          can_approve_requests?: boolean | null
          can_delete_employees?: boolean | null
          can_edit_attendance?: boolean | null
          can_edit_employees?: boolean | null
          can_export_hr_data?: boolean | null
          can_manage_advances?: boolean | null
          can_manage_attendance?: boolean | null
          can_manage_branches?: boolean | null
          can_manage_deductions?: boolean | null
          can_manage_forms?: boolean | null
          can_manage_holidays?: boolean | null
          can_manage_hr_settings?: boolean | null
          can_manage_leave_policy?: boolean | null
          can_manage_loans?: boolean | null
          can_process_payroll?: boolean | null
          can_view_hr_reports?: boolean | null
          can_view_salary_info?: boolean | null
          created_at?: string | null
          email?: string
          full_name?: string
          hr_auth_id?: string
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      hr_payroll_components: {
        Row: {
          account_id: string | null
          affects_eos: boolean
          calculation_type: string
          code: string
          company_id: string
          created_at: string
          formula_expression: string | null
          id: string
          is_active: boolean
          is_attendance_linked: boolean
          is_taxable: boolean
          kind: string
          name_ar: string
          name_en: string | null
          policy_id: string | null
          sort_order: number
          updated_at: string
          value: number
        }
        Insert: {
          account_id?: string | null
          affects_eos?: boolean
          calculation_type: string
          code: string
          company_id: string
          created_at?: string
          formula_expression?: string | null
          id?: string
          is_active?: boolean
          is_attendance_linked?: boolean
          is_taxable?: boolean
          kind: string
          name_ar: string
          name_en?: string | null
          policy_id?: string | null
          sort_order?: number
          updated_at?: string
          value?: number
        }
        Update: {
          account_id?: string | null
          affects_eos?: boolean
          calculation_type?: string
          code?: string
          company_id?: string
          created_at?: string
          formula_expression?: string | null
          id?: string
          is_active?: boolean
          is_attendance_linked?: boolean
          is_taxable?: boolean
          kind?: string
          name_ar?: string
          name_en?: string | null
          policy_id?: string | null
          sort_order?: number
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_payroll_components_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "hr_payroll_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_payroll_policies: {
        Row: {
          absence_calculation: string
          absence_formula: string | null
          allowances_attendance_linked: boolean
          company_id: string
          created_at: string
          created_by: string | null
          daily_work_hours: number
          deductions_mode: string
          description: string | null
          engine_preset: string
          id: string
          is_active: boolean
          is_default: boolean
          late_calculation: string
          late_formula: string | null
          late_grace_minutes: number | null
          late_per_minute_rate: number | null
          month_days_custom: number | null
          month_days_mode: string
          name: string
          overtime_after_hours: number | null
          overtime_multiplier: number
          salary_basis: string
          updated_at: string
        }
        Insert: {
          absence_calculation?: string
          absence_formula?: string | null
          allowances_attendance_linked?: boolean
          company_id: string
          created_at?: string
          created_by?: string | null
          daily_work_hours?: number
          deductions_mode?: string
          description?: string | null
          engine_preset?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          late_calculation?: string
          late_formula?: string | null
          late_grace_minutes?: number | null
          late_per_minute_rate?: number | null
          month_days_custom?: number | null
          month_days_mode?: string
          name: string
          overtime_after_hours?: number | null
          overtime_multiplier?: number
          salary_basis?: string
          updated_at?: string
        }
        Update: {
          absence_calculation?: string
          absence_formula?: string | null
          allowances_attendance_linked?: boolean
          company_id?: string
          created_at?: string
          created_by?: string | null
          daily_work_hours?: number
          deductions_mode?: string
          description?: string | null
          engine_preset?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          late_calculation?: string
          late_formula?: string | null
          late_grace_minutes?: number | null
          late_per_minute_rate?: number | null
          month_days_custom?: number | null
          month_days_mode?: string
          name?: string
          overtime_after_hours?: number | null
          overtime_multiplier?: number
          salary_basis?: string
          updated_at?: string
        }
        Relationships: []
      }
      hr_work_week_config: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          updated_at: string
          user_id: string
          weekly_off_days: number[]
          work_hours_per_day: number
          working_days: number[]
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          updated_at?: string
          user_id: string
          weekly_off_days?: number[]
          work_hours_per_day?: number
          working_days?: number[]
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
          weekly_off_days?: number[]
          work_hours_per_day?: number
          working_days?: number[]
        }
        Relationships: []
      }
      import_cost_distribution: {
        Row: {
          allocated_amount: number | null
          allocation_basis: number | null
          cost_id: string | null
          created_at: string | null
          id: string
          item_id: string | null
          shipment_id: string
        }
        Insert: {
          allocated_amount?: number | null
          allocation_basis?: number | null
          cost_id?: string | null
          created_at?: string | null
          id?: string
          item_id?: string | null
          shipment_id: string
        }
        Update: {
          allocated_amount?: number | null
          allocation_basis?: number | null
          cost_id?: string | null
          created_at?: string | null
          id?: string
          item_id?: string | null
          shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_cost_distribution_cost_id_fkey"
            columns: ["cost_id"]
            isOneToOne: false
            referencedRelation: "import_costs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_cost_distribution_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "import_shipment_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_cost_distribution_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "import_shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      import_costs: {
        Row: {
          account_code: string | null
          amount: number | null
          amount_local: number | null
          cost_name_ar: string
          cost_type: string
          currency_id: string | null
          distribution_method: string | null
          exchange_rate: number | null
          id: string
          notes: string | null
          receipt_url: string | null
          shipment_id: string
          supplier_id: string | null
        }
        Insert: {
          account_code?: string | null
          amount?: number | null
          amount_local?: number | null
          cost_name_ar: string
          cost_type: string
          currency_id?: string | null
          distribution_method?: string | null
          exchange_rate?: number | null
          id?: string
          notes?: string | null
          receipt_url?: string | null
          shipment_id: string
          supplier_id?: string | null
        }
        Update: {
          account_code?: string | null
          amount?: number | null
          amount_local?: number | null
          cost_name_ar?: string
          cost_type?: string
          currency_id?: string | null
          distribution_method?: string | null
          exchange_rate?: number | null
          id?: string
          notes?: string | null
          receipt_url?: string | null
          shipment_id?: string
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_costs_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_costs_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "import_shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_costs_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      import_shipment_items: {
        Row: {
          allocated_customs: number | null
          allocated_other_costs: number | null
          allocated_shipping: number | null
          cbm_per_unit: number | null
          color: string | null
          ctn_qty: number | null
          ctns: number | null
          description_ar: string | null
          description_en: string | null
          id: string
          item_image_url: string | null
          landed_cost_per_unit: number | null
          landed_cost_total: number | null
          line_number: number | null
          model_code: string | null
          product_id: string | null
          quantity: number | null
          shipment_id: string
          size_mm: string | null
          total_allocated_costs: number | null
          total_cbm: number | null
          total_price_foreign: number | null
          total_price_local: number | null
          unit_price_foreign: number | null
        }
        Insert: {
          allocated_customs?: number | null
          allocated_other_costs?: number | null
          allocated_shipping?: number | null
          cbm_per_unit?: number | null
          color?: string | null
          ctn_qty?: number | null
          ctns?: number | null
          description_ar?: string | null
          description_en?: string | null
          id?: string
          item_image_url?: string | null
          landed_cost_per_unit?: number | null
          landed_cost_total?: number | null
          line_number?: number | null
          model_code?: string | null
          product_id?: string | null
          quantity?: number | null
          shipment_id: string
          size_mm?: string | null
          total_allocated_costs?: number | null
          total_cbm?: number | null
          total_price_foreign?: number | null
          total_price_local?: number | null
          unit_price_foreign?: number | null
        }
        Update: {
          allocated_customs?: number | null
          allocated_other_costs?: number | null
          allocated_shipping?: number | null
          cbm_per_unit?: number | null
          color?: string | null
          ctn_qty?: number | null
          ctns?: number | null
          description_ar?: string | null
          description_en?: string | null
          id?: string
          item_image_url?: string | null
          landed_cost_per_unit?: number | null
          landed_cost_total?: number | null
          line_number?: number | null
          model_code?: string | null
          product_id?: string | null
          quantity?: number | null
          shipment_id?: string
          size_mm?: string | null
          total_allocated_costs?: number | null
          total_cbm?: number | null
          total_price_foreign?: number | null
          total_price_local?: number | null
          unit_price_foreign?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "import_shipment_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_warehouse_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "import_shipment_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_shipment_items_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "import_shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      import_shipments: {
        Row: {
          created_at: string | null
          created_by: string | null
          currency_id: string | null
          exchange_rate: number | null
          id: string
          invoice_date: string | null
          notes: string | null
          posted_at: string | null
          shipment_name: string | null
          shipment_number: string
          status: string
          supplier_id: string | null
          supplier_invoice_number: string | null
          total_import_costs: number | null
          total_items_cost_foreign: number | null
          total_items_cost_local: number | null
          total_landed_cost: number | null
          user_id: string
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          currency_id?: string | null
          exchange_rate?: number | null
          id?: string
          invoice_date?: string | null
          notes?: string | null
          posted_at?: string | null
          shipment_name?: string | null
          shipment_number: string
          status?: string
          supplier_id?: string | null
          supplier_invoice_number?: string | null
          total_import_costs?: number | null
          total_items_cost_foreign?: number | null
          total_items_cost_local?: number | null
          total_landed_cost?: number | null
          user_id: string
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          currency_id?: string | null
          exchange_rate?: number | null
          id?: string
          invoice_date?: string | null
          notes?: string | null
          posted_at?: string | null
          shipment_name?: string | null
          shipment_number?: string
          status?: string
          supplier_id?: string | null
          supplier_invoice_number?: string | null
          total_import_costs?: number | null
          total_items_cost_foreign?: number | null
          total_items_cost_local?: number | null
          total_landed_cost?: number | null
          user_id?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_shipments_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_shipments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_shipments_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "product_warehouse_stock"
            referencedColumns: ["warehouse_id"]
          },
          {
            foreignKeyName: "import_shipments_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_activity_log: {
        Row: {
          action: string
          details: Json | null
          id: string
          invoice_id: string
          performed_at: string | null
          user_id: string
        }
        Insert: {
          action: string
          details?: Json | null
          id?: string
          invoice_id: string
          performed_at?: string | null
          user_id: string
        }
        Update: {
          action?: string
          details?: Json | null
          id?: string
          invoice_id?: string
          performed_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_activity_log_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_activity_log_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_drift_invoice_no_link"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          cost_price: number | null
          created_at: string | null
          description: string | null
          discount: number | null
          discount_type: string | null
          id: string
          invoice_id: string
          line_profit: number | null
          product_id: string | null
          product_name: string
          quantity: number
          supplier_id: string | null
          supplier_name: string | null
          tax_rate: number | null
          total_amount: number
          unit_of_measure: string | null
          unit_price: number
          workshop_id: string | null
        }
        Insert: {
          cost_price?: number | null
          created_at?: string | null
          description?: string | null
          discount?: number | null
          discount_type?: string | null
          id?: string
          invoice_id: string
          line_profit?: number | null
          product_id?: string | null
          product_name: string
          quantity?: number
          supplier_id?: string | null
          supplier_name?: string | null
          tax_rate?: number | null
          total_amount?: number
          unit_of_measure?: string | null
          unit_price?: number
          workshop_id?: string | null
        }
        Update: {
          cost_price?: number | null
          created_at?: string | null
          description?: string | null
          discount?: number | null
          discount_type?: string | null
          id?: string
          invoice_id?: string
          line_profit?: number | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          supplier_id?: string | null
          supplier_name?: string | null
          tax_rate?: number | null
          total_amount?: number
          unit_of_measure?: string | null
          unit_price?: number
          workshop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_drift_invoice_no_link"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_sequences: {
        Row: {
          invoice_type: string
          last_number: number
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          invoice_type: string
          last_number?: number
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          invoice_type?: string
          last_number?: number
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount_in_words: string | null
          attachments: Json | null
          billing_address: string | null
          contact_id: string | null
          contact_name: string | null
          correction_reason: string | null
          created_at: string
          currency: string | null
          discount_amount: number | null
          due_date: string | null
          exchange_rate: number | null
          id: string
          invoice_date: string
          invoice_number: string | null
          invoice_type: string
          is_credit_note: boolean | null
          is_voided: boolean
          last_sent_at: string | null
          linked_transaction_id: string | null
          notes: string | null
          notes_internal: string | null
          original_invoice_id: string | null
          paid_amount: number | null
          payment_method: string | null
          payment_status: string | null
          payment_terms: string | null
          pdf_url: string | null
          remaining_amount: number | null
          salesperson_id: string | null
          sent_via: string[] | null
          source: string | null
          status: string | null
          subtotal: number
          tax_amount: number | null
          tax_inclusive: boolean | null
          terms: string | null
          total_amount: number
          updated_at: string
          user_id: string
          void_reason: string | null
          voided_at: string | null
          warehouse_id: string | null
          workshop_id: string | null
        }
        Insert: {
          amount_in_words?: string | null
          attachments?: Json | null
          billing_address?: string | null
          contact_id?: string | null
          contact_name?: string | null
          correction_reason?: string | null
          created_at?: string
          currency?: string | null
          discount_amount?: number | null
          due_date?: string | null
          exchange_rate?: number | null
          id?: string
          invoice_date?: string
          invoice_number?: string | null
          invoice_type?: string
          is_credit_note?: boolean | null
          is_voided?: boolean
          last_sent_at?: string | null
          linked_transaction_id?: string | null
          notes?: string | null
          notes_internal?: string | null
          original_invoice_id?: string | null
          paid_amount?: number | null
          payment_method?: string | null
          payment_status?: string | null
          payment_terms?: string | null
          pdf_url?: string | null
          remaining_amount?: number | null
          salesperson_id?: string | null
          sent_via?: string[] | null
          source?: string | null
          status?: string | null
          subtotal?: number
          tax_amount?: number | null
          tax_inclusive?: boolean | null
          terms?: string | null
          total_amount?: number
          updated_at?: string
          user_id: string
          void_reason?: string | null
          voided_at?: string | null
          warehouse_id?: string | null
          workshop_id?: string | null
        }
        Update: {
          amount_in_words?: string | null
          attachments?: Json | null
          billing_address?: string | null
          contact_id?: string | null
          contact_name?: string | null
          correction_reason?: string | null
          created_at?: string
          currency?: string | null
          discount_amount?: number | null
          due_date?: string | null
          exchange_rate?: number | null
          id?: string
          invoice_date?: string
          invoice_number?: string | null
          invoice_type?: string
          is_credit_note?: boolean | null
          is_voided?: boolean
          last_sent_at?: string | null
          linked_transaction_id?: string | null
          notes?: string | null
          notes_internal?: string | null
          original_invoice_id?: string | null
          paid_amount?: number | null
          payment_method?: string | null
          payment_status?: string | null
          payment_terms?: string | null
          pdf_url?: string | null
          remaining_amount?: number | null
          salesperson_id?: string | null
          sent_via?: string[] | null
          source?: string | null
          status?: string | null
          subtotal?: number
          tax_amount?: number | null
          tax_inclusive?: boolean | null
          terms?: string | null
          total_amount?: number
          updated_at?: string
          user_id?: string
          void_reason?: string | null
          voided_at?: string | null
          warehouse_id?: string | null
          workshop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_original_invoice_id_fkey"
            columns: ["original_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_original_invoice_id_fkey"
            columns: ["original_invoice_id"]
            isOneToOne: false
            referencedRelation: "v_drift_invoice_no_link"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "product_warehouse_stock"
            referencedColumns: ["warehouse_id"]
          },
          {
            foreignKeyName: "invoices_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      item_categories: {
        Row: {
          color: string | null
          company_id: string | null
          icon: string | null
          id: string
          name: string
          sort_order: number | null
          user_id: string | null
        }
        Insert: {
          color?: string | null
          company_id?: string | null
          icon?: string | null
          id?: string
          name: string
          sort_order?: number | null
          user_id?: string | null
        }
        Update: {
          color?: string | null
          company_id?: string | null
          icon?: string | null
          id?: string
          name?: string
          sort_order?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      job_titles: {
        Row: {
          created_at: string
          department_id: string | null
          description: string | null
          id: string
          is_active: boolean
          is_deleted: boolean
          name: string
          name_ar: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          name: string
          name_ar?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          name?: string
          name_ar?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_titles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_templates: {
        Row: {
          created_at: string
          default_contact_id: string | null
          default_subtype: string | null
          description: string | null
          icon: string | null
          id: string
          is_pinned: boolean
          last_used_at: string | null
          lines: Json
          name: string
          updated_at: string
          usage_count: number
          user_id: string
        }
        Insert: {
          created_at?: string
          default_contact_id?: string | null
          default_subtype?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_pinned?: boolean
          last_used_at?: string | null
          lines?: Json
          name: string
          updated_at?: string
          usage_count?: number
          user_id: string
        }
        Update: {
          created_at?: string
          default_contact_id?: string | null
          default_subtype?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_pinned?: boolean
          last_used_at?: string | null
          lines?: Json
          name?: string
          updated_at?: string
          usage_count?: number
          user_id?: string
        }
        Relationships: []
      }
      kitchen_stations: {
        Row: {
          branch_id: string | null
          color: string | null
          created_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          name: string
          station_type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          color?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          station_type?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          branch_id?: string | null
          color?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          station_type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_stations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_stations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      kitchen_tickets: {
        Row: {
          accepted_at: string | null
          completed_at: string | null
          created_at: string | null
          id: string
          items: Json
          order_id: string
          printed_at: string | null
          station_id: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          items?: Json
          order_id: string
          printed_at?: string | null
          station_id: string
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          items?: Json
          order_id?: string
          printed_at?: string | null
          station_id?: string
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "pos_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_tickets_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "kitchen_stations"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          days_count: number | null
          employee_id: string
          end_date: string
          id: string
          leave_type: string
          reason: string | null
          review_notes: string | null
          start_date: string
          status: string | null
          temporary_exit_hours: number | null
          temporary_exit_return_time: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          days_count?: number | null
          employee_id: string
          end_date: string
          id?: string
          leave_type?: string
          reason?: string | null
          review_notes?: string | null
          start_date: string
          status?: string | null
          temporary_exit_hours?: number | null
          temporary_exit_return_time?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          days_count?: number | null
          employee_id?: string
          end_date?: string
          id?: string
          leave_type?: string
          reason?: string | null
          review_notes?: string | null
          start_date?: string
          status?: string | null
          temporary_exit_hours?: number | null
          temporary_exit_return_time?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_attachments: {
        Row: {
          created_at: string
          description: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          loan_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          loan_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          loan_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_attachments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "employee_loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_installments: {
        Row: {
          balance_after: number
          company_id: string | null
          created_at: string | null
          due_date: string
          employee_id: string
          id: string
          installment_amount: number
          loan_id: string
          month_number: number
          notes: string | null
          paid_date: string | null
          payroll_month: number | null
          payroll_year: number | null
          status: string | null
          user_id: string
        }
        Insert: {
          balance_after: number
          company_id?: string | null
          created_at?: string | null
          due_date: string
          employee_id: string
          id?: string
          installment_amount: number
          loan_id: string
          month_number: number
          notes?: string | null
          paid_date?: string | null
          payroll_month?: number | null
          payroll_year?: number | null
          status?: string | null
          user_id: string
        }
        Update: {
          balance_after?: number
          company_id?: string | null
          created_at?: string | null
          due_date?: string
          employee_id?: string
          id?: string
          installment_amount?: number
          loan_id?: string
          month_number?: number
          notes?: string | null
          paid_date?: string | null
          payroll_month?: number | null
          payroll_year?: number | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_installments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "employee_loans"
            referencedColumns: ["id"]
          },
        ]
      }
      malaki_portal_settings: {
        Row: {
          branch_daily_targets: Json | null
          company_name: string | null
          exchange_rate_jod: number | null
          exchange_rate_usd: number | null
          id: string
          linked_user_id: string | null
          logo_url: string | null
          rates_updated_at: string | null
          rates_updated_by: string | null
          updated_at: string | null
        }
        Insert: {
          branch_daily_targets?: Json | null
          company_name?: string | null
          exchange_rate_jod?: number | null
          exchange_rate_usd?: number | null
          id?: string
          linked_user_id?: string | null
          logo_url?: string | null
          rates_updated_at?: string | null
          rates_updated_by?: string | null
          updated_at?: string | null
        }
        Update: {
          branch_daily_targets?: Json | null
          company_name?: string | null
          exchange_rate_jod?: number | null
          exchange_rate_usd?: number | null
          id?: string
          linked_user_id?: string | null
          logo_url?: string | null
          rates_updated_at?: string | null
          rates_updated_by?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      malaki_portal_users: {
        Row: {
          allowed_branch_ids: string[] | null
          auth_user_id: string | null
          can_see_all_branches: boolean | null
          can_see_liquidity: boolean | null
          can_see_sales: boolean | null
          created_at: string | null
          email: string | null
          full_name: string
          id: string
          is_active: boolean | null
          last_login: string | null
          password_hash: string
          role: string | null
          user_id: string | null
          username: string
        }
        Insert: {
          allowed_branch_ids?: string[] | null
          auth_user_id?: string | null
          can_see_all_branches?: boolean | null
          can_see_liquidity?: boolean | null
          can_see_sales?: boolean | null
          created_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean | null
          last_login?: string | null
          password_hash: string
          role?: string | null
          user_id?: string | null
          username: string
        }
        Update: {
          allowed_branch_ids?: string[] | null
          auth_user_id?: string | null
          can_see_all_branches?: boolean | null
          can_see_liquidity?: boolean | null
          can_see_sales?: boolean | null
          created_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean | null
          last_login?: string | null
          password_hash?: string
          role?: string | null
          user_id?: string | null
          username?: string
        }
        Relationships: []
      }
      modifier_groups: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          is_required: boolean | null
          max_select: number | null
          min_select: number | null
          name: string
          name_en: string | null
          selection_type: string | null
          sort_order: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          max_select?: number | null
          min_select?: number | null
          name: string
          name_en?: string | null
          selection_type?: string | null
          sort_order?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          max_select?: number | null
          min_select?: number | null
          name?: string
          name_en?: string | null
          selection_type?: string | null
          sort_order?: number | null
          user_id?: string
        }
        Relationships: []
      }
      modifier_options: {
        Row: {
          color: string | null
          created_at: string | null
          extra_price: number | null
          group_id: string
          id: string
          is_active: boolean | null
          is_default: boolean | null
          name: string
          name_en: string | null
          sort_order: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          extra_price?: number | null
          group_id: string
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name: string
          name_en?: string | null
          sort_order?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          extra_price?: number | null
          group_id?: string
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          name_en?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "modifier_options_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_payroll_inputs: {
        Row: {
          annual_leave_days: number | null
          cash_advances: number | null
          cash_shortage: number | null
          cash_surplus: number | null
          company_id: string | null
          created_at: string | null
          created_by: string | null
          deduction_notes: string | null
          delivery: number | null
          employee_id: string
          extra_work_allowance: number | null
          food_individual: number | null
          food_total: number | null
          has_termination_pay: boolean | null
          holiday_overtime_hours: number | null
          id: string
          loan_installment: number | null
          month: number
          new_advance: number | null
          opening_advance_balance: number | null
          other_deduction: number | null
          overtime_hours: number | null
          purchases: number | null
          sick_leave_days: number | null
          special_allowance: number | null
          updated_at: string | null
          vacation_hours: number | null
          violations: number | null
          working_days: number | null
          working_hours: number | null
          year: number
        }
        Insert: {
          annual_leave_days?: number | null
          cash_advances?: number | null
          cash_shortage?: number | null
          cash_surplus?: number | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deduction_notes?: string | null
          delivery?: number | null
          employee_id: string
          extra_work_allowance?: number | null
          food_individual?: number | null
          food_total?: number | null
          has_termination_pay?: boolean | null
          holiday_overtime_hours?: number | null
          id?: string
          loan_installment?: number | null
          month: number
          new_advance?: number | null
          opening_advance_balance?: number | null
          other_deduction?: number | null
          overtime_hours?: number | null
          purchases?: number | null
          sick_leave_days?: number | null
          special_allowance?: number | null
          updated_at?: string | null
          vacation_hours?: number | null
          violations?: number | null
          working_days?: number | null
          working_hours?: number | null
          year: number
        }
        Update: {
          annual_leave_days?: number | null
          cash_advances?: number | null
          cash_shortage?: number | null
          cash_surplus?: number | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deduction_notes?: string | null
          delivery?: number | null
          employee_id?: string
          extra_work_allowance?: number | null
          food_individual?: number | null
          food_total?: number | null
          has_termination_pay?: boolean | null
          holiday_overtime_hours?: number | null
          id?: string
          loan_installment?: number | null
          month?: number
          new_advance?: number | null
          opening_advance_balance?: number | null
          other_deduction?: number | null
          overtime_hours?: number | null
          purchases?: number | null
          sick_leave_days?: number | null
          special_allowance?: number | null
          updated_at?: string | null
          vacation_hours?: number | null
          violations?: number | null
          working_days?: number | null
          working_hours?: number | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "monthly_payroll_inputs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_payroll_inputs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_payroll_inputs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_log: {
        Row: {
          body: string | null
          channel: string
          created_at: string
          id: string
          path: string | null
          read_at: string | null
          sent_at: string
          title: string | null
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          channel?: string
          created_at?: string
          id?: string
          path?: string | null
          read_at?: string | null
          sent_at?: string
          title?: string | null
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          channel?: string
          created_at?: string
          id?: string
          path?: string | null
          read_at?: string | null
          sent_at?: string
          title?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      official_holidays: {
        Row: {
          created_at: string | null
          day_type_id: string | null
          holiday_date: string
          id: string
          is_active: boolean
          is_recurring: boolean | null
          multiplier: number | null
          name: string
          notes: string | null
          recurring_day: number | null
          recurring_month: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          day_type_id?: string | null
          holiday_date: string
          id?: string
          is_active?: boolean
          is_recurring?: boolean | null
          multiplier?: number | null
          name: string
          notes?: string | null
          recurring_day?: number | null
          recurring_month?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          day_type_id?: string | null
          holiday_date?: string
          id?: string
          is_active?: boolean
          is_recurring?: boolean | null
          multiplier?: number | null
          name?: string
          notes?: string | null
          recurring_day?: number | null
          recurring_month?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "official_holidays_day_type_id_fkey"
            columns: ["day_type_id"]
            isOneToOne: false
            referencedRelation: "hr_day_types"
            referencedColumns: ["id"]
          },
        ]
      }
      opening_balance_batches: {
        Row: {
          batch_date: string
          created_at: string
          currency: string
          id: string
          notes: string | null
          status: string
          total_credit: number
          total_debit: number
          updated_at: string
          user_id: string
        }
        Insert: {
          batch_date?: string
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          status?: string
          total_credit?: number
          total_debit?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          batch_date?: string
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          status?: string
          total_credit?: number
          total_debit?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      opening_balance_entries: {
        Row: {
          account_code: string | null
          account_name: string | null
          batch_id: string
          created_at: string
          credit_amount: number
          currency: string
          debit_amount: number
          entity_name: string | null
          entity_type: string
          id: string
          metadata: Json | null
          notes: string | null
          user_id: string
        }
        Insert: {
          account_code?: string | null
          account_name?: string | null
          batch_id: string
          created_at?: string
          credit_amount?: number
          currency?: string
          debit_amount?: number
          entity_name?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          user_id: string
        }
        Update: {
          account_code?: string | null
          account_name?: string | null
          batch_id?: string
          created_at?: string
          credit_amount?: number
          currency?: string
          debit_amount?: number
          entity_name?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opening_balance_entries_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "opening_balance_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_modifiers: {
        Row: {
          created_at: string | null
          extra_price: number | null
          group_name: string | null
          id: string
          modifier_group_id: string | null
          modifier_option_id: string | null
          option_name: string
          order_line_id: string
          quantity: number | null
        }
        Insert: {
          created_at?: string | null
          extra_price?: number | null
          group_name?: string | null
          id?: string
          modifier_group_id?: string | null
          modifier_option_id?: string | null
          option_name: string
          order_line_id: string
          quantity?: number | null
        }
        Update: {
          created_at?: string | null
          extra_price?: number | null
          group_name?: string | null
          id?: string
          modifier_group_id?: string | null
          modifier_option_id?: string | null
          option_name?: string
          order_line_id?: string
          quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_item_modifiers_modifier_group_id_fkey"
            columns: ["modifier_group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_modifiers_modifier_option_id_fkey"
            columns: ["modifier_option_id"]
            isOneToOne: false
            referencedRelation: "modifier_options"
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
            referencedRelation: "product_warehouse_stock"
            referencedColumns: ["product_id"]
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
      order_status_log: {
        Row: {
          actual_duration_hours: number | null
          changed_at: string | null
          changed_by: string
          changed_by_name: string
          changed_by_role: string | null
          created_at: string | null
          estimated_duration_hours: number | null
          from_status: string | null
          id: string
          metadata: Json | null
          notes: string | null
          order_id: string
          order_table: string
          sub_stage: string | null
          to_status: string
          user_id: string
        }
        Insert: {
          actual_duration_hours?: number | null
          changed_at?: string | null
          changed_by: string
          changed_by_name: string
          changed_by_role?: string | null
          created_at?: string | null
          estimated_duration_hours?: number | null
          from_status?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          order_id: string
          order_table?: string
          sub_stage?: string | null
          to_status: string
          user_id: string
        }
        Update: {
          actual_duration_hours?: number | null
          changed_at?: string | null
          changed_by?: string
          changed_by_name?: string
          changed_by_role?: string | null
          created_at?: string | null
          estimated_duration_hours?: number | null
          from_status?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          order_id?: string
          order_table?: string
          sub_stage?: string | null
          to_status?: string
          user_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          contact_id: string | null
          cost_breakdown: Json | null
          created_at: string
          customer_address: string | null
          customer_name: string
          customer_phone: string | null
          delivery_date: string | null
          discount: number
          id: string
          invoice_id: string | null
          invoiced_at: string | null
          invoiced_by: string | null
          linked_invoice_id: string | null
          notes: string | null
          order_date: string
          order_number: string | null
          paid_amount: number | null
          payment_method: string | null
          payment_status: string
          production_cost: number | null
          production_status: string | null
          remaining_amount: number | null
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
          contact_id?: string | null
          cost_breakdown?: Json | null
          created_at?: string
          customer_address?: string | null
          customer_name: string
          customer_phone?: string | null
          delivery_date?: string | null
          discount?: number
          id?: string
          invoice_id?: string | null
          invoiced_at?: string | null
          invoiced_by?: string | null
          linked_invoice_id?: string | null
          notes?: string | null
          order_date?: string
          order_number?: string | null
          paid_amount?: number | null
          payment_method?: string | null
          payment_status?: string
          production_cost?: number | null
          production_status?: string | null
          remaining_amount?: number | null
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
          contact_id?: string | null
          cost_breakdown?: Json | null
          created_at?: string
          customer_address?: string | null
          customer_name?: string
          customer_phone?: string | null
          delivery_date?: string | null
          discount?: number
          id?: string
          invoice_id?: string | null
          invoiced_at?: string | null
          invoiced_by?: string | null
          linked_invoice_id?: string | null
          notes?: string | null
          order_date?: string
          order_number?: string | null
          paid_amount?: number | null
          payment_method?: string | null
          payment_status?: string
          production_cost?: number | null
          production_status?: string | null
          remaining_amount?: number | null
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
            foreignKeyName: "orders_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
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
      payment_invoice_links: {
        Row: {
          allocated_amount: number
          created_at: string | null
          id: string
          invoice_id: string
          payment_id: string | null
          source: string
          transaction_id: string | null
          user_id: string | null
        }
        Insert: {
          allocated_amount?: number
          created_at?: string | null
          id?: string
          invoice_id: string
          payment_id?: string | null
          source?: string
          transaction_id?: string | null
          user_id?: string | null
        }
        Update: {
          allocated_amount?: number
          created_at?: string | null
          id?: string
          invoice_id?: string
          payment_id?: string | null
          source?: string
          transaction_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_invoice_links_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_invoice_links_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_drift_invoice_no_link"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_invoice_links_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "receipt_vouchers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_invoice_links_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_invoice_links_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_drift_tx_no_idempotency"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_invoice_links_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_drift_tx_no_reference"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_invoice_links_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_drift_tx_same_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_invoice_links_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_drift_tx_zero_amount"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number | null
          card_brand: string | null
          card_last4: string | null
          company_id: string | null
          created_at: string | null
          currency: string | null
          gateway_ref: string | null
          gateway_response: Json | null
          id: string
          invoice_number: string | null
          paid_at: string | null
          payment_method: string | null
          status: string | null
          subscription_id: string | null
        }
        Insert: {
          amount?: number | null
          card_brand?: string | null
          card_last4?: string | null
          company_id?: string | null
          created_at?: string | null
          currency?: string | null
          gateway_ref?: string | null
          gateway_response?: Json | null
          id?: string
          invoice_number?: string | null
          paid_at?: string | null
          payment_method?: string | null
          status?: string | null
          subscription_id?: string | null
        }
        Update: {
          amount?: number | null
          card_brand?: string | null
          card_last4?: string | null
          company_id?: string | null
          created_at?: string | null
          currency?: string | null
          gateway_ref?: string | null
          gateway_response?: Json | null
          id?: string
          invoice_number?: string | null
          paid_at?: string | null
          payment_method?: string | null
          status?: string | null
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_batches: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          notes: string | null
          paid_at: string | null
          paid_by: string | null
          payment_method: string | null
          period_month: number
          period_year: number
          status: Database["public"]["Enums"]["payroll_status"]
          submitted_at: string
          submitted_by: string | null
          total_employees: number
          total_net_salary: number
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_method?: string | null
          period_month: number
          period_year: number
          status?: Database["public"]["Enums"]["payroll_status"]
          submitted_at?: string
          submitted_by?: string | null
          total_employees?: number
          total_net_salary?: number
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_method?: string | null
          period_month?: number
          period_year?: number
          status?: Database["public"]["Enums"]["payroll_status"]
          submitted_at?: string
          submitted_by?: string | null
          total_employees?: number
          total_net_salary?: number
          user_id?: string
        }
        Relationships: []
      }
      payroll_settings: {
        Row: {
          annual_increment_per_year: number | null
          attendance_bonus_max_absent: number | null
          attendance_bonus_rate: number | null
          base_month_days: number | null
          child_allowance: number | null
          company_id: string
          created_at: string | null
          currency: string | null
          currency_symbol: string | null
          default_hourly_rate: number | null
          family_allowance_start_months: number | null
          food_group_percentage: number | null
          food_individual_percentage: number | null
          food_transport_base: number | null
          food_transport_start_months: number | null
          full_attendance_days: number | null
          id: string
          min_deduction_threshold: number | null
          overtime_multiplier: number | null
          updated_at: string | null
          wife_allowance: number | null
        }
        Insert: {
          annual_increment_per_year?: number | null
          attendance_bonus_max_absent?: number | null
          attendance_bonus_rate?: number | null
          base_month_days?: number | null
          child_allowance?: number | null
          company_id: string
          created_at?: string | null
          currency?: string | null
          currency_symbol?: string | null
          default_hourly_rate?: number | null
          family_allowance_start_months?: number | null
          food_group_percentage?: number | null
          food_individual_percentage?: number | null
          food_transport_base?: number | null
          food_transport_start_months?: number | null
          full_attendance_days?: number | null
          id?: string
          min_deduction_threshold?: number | null
          overtime_multiplier?: number | null
          updated_at?: string | null
          wife_allowance?: number | null
        }
        Update: {
          annual_increment_per_year?: number | null
          attendance_bonus_max_absent?: number | null
          attendance_bonus_rate?: number | null
          base_month_days?: number | null
          child_allowance?: number | null
          company_id?: string
          created_at?: string | null
          currency?: string | null
          currency_symbol?: string | null
          default_hourly_rate?: number | null
          family_allowance_start_months?: number | null
          food_group_percentage?: number | null
          food_individual_percentage?: number | null
          food_transport_base?: number | null
          food_transport_start_months?: number | null
          full_attendance_days?: number | null
          id?: string
          min_deduction_threshold?: number | null
          overtime_multiplier?: number | null
          updated_at?: string | null
          wife_allowance?: number | null
        }
        Relationships: []
      }
      pbx_call_events: {
        Row: {
          call_id: string | null
          called_number: string | null
          caller_number: string
          created_at: string
          customer_address: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          handled: boolean
          id: string
          status: string
          trunk_name: string | null
          user_id: string
        }
        Insert: {
          call_id?: string | null
          called_number?: string | null
          caller_number: string
          created_at?: string
          customer_address?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          handled?: boolean
          id?: string
          status?: string
          trunk_name?: string | null
          user_id: string
        }
        Update: {
          call_id?: string | null
          called_number?: string | null
          caller_number?: string
          created_at?: string
          customer_address?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          handled?: boolean
          id?: string
          status?: string
          trunk_name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pbx_call_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pos_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          ai_limit: number | null
          annual_discount_pct: number
          annual_price: number | null
          created_at: string
          currency: string | null
          display_order: number
          enabled_modules: string[] | null
          features: Json
          id: string
          is_active: boolean
          is_featured: boolean | null
          is_recommended: boolean | null
          limits: Json | null
          max_branches: number | null
          max_companies: number
          max_invoices_per_month: number | null
          max_users: number
          monthly_price: number
          name: string
          name_ar: string
          plan_key: string
          sort_order: number | null
          tier: string | null
          updated_at: string
        }
        Insert: {
          ai_limit?: number | null
          annual_discount_pct?: number
          annual_price?: number | null
          created_at?: string
          currency?: string | null
          display_order?: number
          enabled_modules?: string[] | null
          features?: Json
          id?: string
          is_active?: boolean
          is_featured?: boolean | null
          is_recommended?: boolean | null
          limits?: Json | null
          max_branches?: number | null
          max_companies?: number
          max_invoices_per_month?: number | null
          max_users?: number
          monthly_price?: number
          name: string
          name_ar: string
          plan_key: string
          sort_order?: number | null
          tier?: string | null
          updated_at?: string
        }
        Update: {
          ai_limit?: number | null
          annual_discount_pct?: number
          annual_price?: number | null
          created_at?: string
          currency?: string | null
          display_order?: number
          enabled_modules?: string[] | null
          features?: Json
          id?: string
          is_active?: boolean
          is_featured?: boolean | null
          is_recommended?: boolean | null
          limits?: Json | null
          max_branches?: number | null
          max_companies?: number
          max_invoices_per_month?: number | null
          max_users?: number
          monthly_price?: number
          name?: string
          name_ar?: string
          plan_key?: string
          sort_order?: number | null
          tier?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pos_audit_log: {
        Row: {
          action: string
          approved_by: string | null
          cashier_id: string | null
          cashier_name: string | null
          created_at: string
          details: Json | null
          id: string
          new_total: number | null
          order_id: string | null
          original_total: number | null
          reason: string | null
          terminal_name: string | null
          user_id: string
        }
        Insert: {
          action: string
          approved_by?: string | null
          cashier_id?: string | null
          cashier_name?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          new_total?: number | null
          order_id?: string | null
          original_total?: number | null
          reason?: string | null
          terminal_name?: string | null
          user_id: string
        }
        Update: {
          action?: string
          approved_by?: string | null
          cashier_id?: string | null
          cashier_name?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          new_total?: number | null
          order_id?: string | null
          original_total?: number | null
          reason?: string | null
          terminal_name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_audit_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "pos_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_audit_logs: {
        Row: {
          action_type: string
          actor_pos_user_id: string | null
          company_id: string
          created_at: string
          device_fingerprint: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          user_id: string
        }
        Insert: {
          action_type: string
          actor_pos_user_id?: string | null
          company_id: string
          created_at?: string
          device_fingerprint?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_id: string
        }
        Update: {
          action_type?: string
          actor_pos_user_id?: string | null
          company_id?: string
          created_at?: string
          device_fingerprint?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_audit_logs_actor_pos_user_id_fkey"
            columns: ["actor_pos_user_id"]
            isOneToOne: false
            referencedRelation: "pos_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "pos_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_cancel_reasons: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          is_system: boolean
          reason_text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          is_system?: boolean
          reason_text: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          is_system?: boolean
          reason_text?: string
          user_id?: string
        }
        Relationships: []
      }
      pos_categories: {
        Row: {
          color: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          name: string
          parent_id: string | null
          restricted_cash_box_ids: string[] | null
          sort_order: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          parent_id?: string | null
          restricted_cash_box_ids?: string[] | null
          sort_order?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          parent_id?: string | null
          restricted_cash_box_ids?: string[] | null
          sort_order?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "pos_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_companies: {
        Row: {
          address: string | null
          created_at: string
          currency_code: string
          email: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          name_en: string | null
          phone: string | null
          settings: Json | null
          tax_rate: number
          updated_at: string
          user_id: string
          vat_number: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          currency_code?: string
          email?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          name_en?: string | null
          phone?: string | null
          settings?: Json | null
          tax_rate?: number
          updated_at?: string
          user_id: string
          vat_number?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          currency_code?: string
          email?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          name_en?: string | null
          phone?: string | null
          settings?: Json | null
          tax_rate?: number
          updated_at?: string
          user_id?: string
          vat_number?: string | null
        }
        Relationships: []
      }
      pos_customers: {
        Row: {
          address: string | null
          age_group: string | null
          consent_date: string | null
          created_at: string | null
          email: string | null
          gender: string | null
          id: string
          last_visit: string | null
          marketing_consent: boolean | null
          name: string | null
          nationality: string | null
          total_discounts: number | null
          total_spent: number | null
          total_visits: number | null
          user_id: string
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          age_group?: string | null
          consent_date?: string | null
          created_at?: string | null
          email?: string | null
          gender?: string | null
          id?: string
          last_visit?: string | null
          marketing_consent?: boolean | null
          name?: string | null
          nationality?: string | null
          total_discounts?: number | null
          total_spent?: number | null
          total_visits?: number | null
          user_id: string
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          age_group?: string | null
          consent_date?: string | null
          created_at?: string | null
          email?: string | null
          gender?: string | null
          id?: string
          last_visit?: string | null
          marketing_consent?: boolean | null
          name?: string | null
          nationality?: string | null
          total_discounts?: number | null
          total_spent?: number | null
          total_visits?: number | null
          user_id?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      pos_devices: {
        Row: {
          branch_id: string | null
          company_id: string
          created_at: string
          device_fingerprint: string
          device_name: string
          id: string
          is_active: boolean
          last_seen_at: string | null
          terminal_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          company_id: string
          created_at?: string
          device_fingerprint: string
          device_name: string
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          terminal_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          branch_id?: string | null
          company_id?: string
          created_at?: string
          device_fingerprint?: string
          device_name?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          terminal_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_devices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_devices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_devices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "pos_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_devices_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "pos_terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_expense_categories: {
        Row: {
          account_code: string | null
          created_at: string
          id: string
          name: string
          type: string
          user_id: string
        }
        Insert: {
          account_code?: string | null
          created_at?: string
          id?: string
          name: string
          type?: string
          user_id: string
        }
        Update: {
          account_code?: string | null
          created_at?: string
          id?: string
          name?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      pos_expenses: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          shift_id: string | null
          user_id: string
        }
        Insert: {
          amount?: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          shift_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          shift_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "pos_expense_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_inventory_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          product_id: string
          quantity: number
          shift_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          product_id: string
          quantity?: number
          shift_id?: string | null
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          shift_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_warehouse_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "pos_inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_order_lines: {
        Row: {
          cost_price: number
          created_at: string
          discount_amount: number
          discount_pct: number
          id: string
          notes: string | null
          order_id: string
          product_id: string | null
          product_name: string
          qty: number
          sku: string | null
          subtotal: number
          tax_amount: number
          tax_rate: number
          total: number
          unit: string
          unit_price: number
          user_id: string
        }
        Insert: {
          cost_price?: number
          created_at?: string
          discount_amount?: number
          discount_pct?: number
          id?: string
          notes?: string | null
          order_id: string
          product_id?: string | null
          product_name: string
          qty?: number
          sku?: string | null
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          unit?: string
          unit_price?: number
          user_id: string
        }
        Update: {
          cost_price?: number
          created_at?: string
          discount_amount?: number
          discount_pct?: number
          id?: string
          notes?: string | null
          order_id?: string
          product_id?: string | null
          product_name?: string
          qty?: number
          sku?: string | null
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          unit?: string
          unit_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "pos_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_warehouse_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "pos_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_orders: {
        Row: {
          area_name: string | null
          assigned_captain_name: string | null
          assigned_captain_phone: string | null
          assigned_captain_vehicle: string | null
          cancel_reason: string | null
          cancelled_approved_by: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          company_id: string
          created_at: string
          currency: string
          customer_address: string | null
          customer_discount_pct: number | null
          customer_id: string | null
          customer_name: string | null
          delivery_accepted_at: string | null
          delivery_address: string | null
          delivery_requested_at: string | null
          delivery_status: string | null
          digital_receipt_sent: boolean | null
          discount_amount: number
          discount_type: string | null
          display_number: string | null
          guest_count: number | null
          guest_name: string | null
          id: string
          ils_equivalent: number | null
          is_delivery: boolean | null
          is_return: boolean
          linked_transaction_id: string | null
          local_id: string | null
          notes: string | null
          order_note: string | null
          order_number: string | null
          order_type: string | null
          original_order_id: string | null
          paid_at: string | null
          payment_currency: string | null
          payment_currency_amount: number | null
          payment_currency_rate: number | null
          pos_customer_id: string | null
          queue_number: number | null
          rate_source: string | null
          recall_reason: string | null
          recall_status: string | null
          recalled_approved_by: string | null
          recalled_at: string | null
          recalled_by: string | null
          return_currency: string | null
          return_currency_amount: number | null
          return_exchange_rate: number | null
          return_of_order_id: string | null
          return_reason: string | null
          session_id: string
          state: string
          subtotal: number
          survey_sent: boolean | null
          survey_token: string | null
          sync_status: string | null
          synced_at: string | null
          table_id: string | null
          tax_amount: number
          total: number
          transaction_id: string | null
          transferred_from_session_id: string | null
          transferred_to_name: string | null
          updated_at: string
          user_id: string
          warehouse_id: string | null
          was_offline: boolean | null
          zone_code: string | null
        }
        Insert: {
          area_name?: string | null
          assigned_captain_name?: string | null
          assigned_captain_phone?: string | null
          assigned_captain_vehicle?: string | null
          cancel_reason?: string | null
          cancelled_approved_by?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          company_id: string
          created_at?: string
          currency?: string
          customer_address?: string | null
          customer_discount_pct?: number | null
          customer_id?: string | null
          customer_name?: string | null
          delivery_accepted_at?: string | null
          delivery_address?: string | null
          delivery_requested_at?: string | null
          delivery_status?: string | null
          digital_receipt_sent?: boolean | null
          discount_amount?: number
          discount_type?: string | null
          display_number?: string | null
          guest_count?: number | null
          guest_name?: string | null
          id?: string
          ils_equivalent?: number | null
          is_delivery?: boolean | null
          is_return?: boolean
          linked_transaction_id?: string | null
          local_id?: string | null
          notes?: string | null
          order_note?: string | null
          order_number?: string | null
          order_type?: string | null
          original_order_id?: string | null
          paid_at?: string | null
          payment_currency?: string | null
          payment_currency_amount?: number | null
          payment_currency_rate?: number | null
          pos_customer_id?: string | null
          queue_number?: number | null
          rate_source?: string | null
          recall_reason?: string | null
          recall_status?: string | null
          recalled_approved_by?: string | null
          recalled_at?: string | null
          recalled_by?: string | null
          return_currency?: string | null
          return_currency_amount?: number | null
          return_exchange_rate?: number | null
          return_of_order_id?: string | null
          return_reason?: string | null
          session_id: string
          state?: string
          subtotal?: number
          survey_sent?: boolean | null
          survey_token?: string | null
          sync_status?: string | null
          synced_at?: string | null
          table_id?: string | null
          tax_amount?: number
          total?: number
          transaction_id?: string | null
          transferred_from_session_id?: string | null
          transferred_to_name?: string | null
          updated_at?: string
          user_id: string
          warehouse_id?: string | null
          was_offline?: boolean | null
          zone_code?: string | null
        }
        Update: {
          area_name?: string | null
          assigned_captain_name?: string | null
          assigned_captain_phone?: string | null
          assigned_captain_vehicle?: string | null
          cancel_reason?: string | null
          cancelled_approved_by?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          company_id?: string
          created_at?: string
          currency?: string
          customer_address?: string | null
          customer_discount_pct?: number | null
          customer_id?: string | null
          customer_name?: string | null
          delivery_accepted_at?: string | null
          delivery_address?: string | null
          delivery_requested_at?: string | null
          delivery_status?: string | null
          digital_receipt_sent?: boolean | null
          discount_amount?: number
          discount_type?: string | null
          display_number?: string | null
          guest_count?: number | null
          guest_name?: string | null
          id?: string
          ils_equivalent?: number | null
          is_delivery?: boolean | null
          is_return?: boolean
          linked_transaction_id?: string | null
          local_id?: string | null
          notes?: string | null
          order_note?: string | null
          order_number?: string | null
          order_type?: string | null
          original_order_id?: string | null
          paid_at?: string | null
          payment_currency?: string | null
          payment_currency_amount?: number | null
          payment_currency_rate?: number | null
          pos_customer_id?: string | null
          queue_number?: number | null
          rate_source?: string | null
          recall_reason?: string | null
          recall_status?: string | null
          recalled_approved_by?: string | null
          recalled_at?: string | null
          recalled_by?: string | null
          return_currency?: string | null
          return_currency_amount?: number | null
          return_exchange_rate?: number | null
          return_of_order_id?: string | null
          return_reason?: string | null
          session_id?: string
          state?: string
          subtotal?: number
          survey_sent?: boolean | null
          survey_token?: string | null
          sync_status?: string | null
          synced_at?: string | null
          table_id?: string | null
          tax_amount?: number
          total?: number
          transaction_id?: string | null
          transferred_from_session_id?: string | null
          transferred_to_name?: string | null
          updated_at?: string
          user_id?: string
          warehouse_id?: string | null
          was_offline?: boolean | null
          zone_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "pos_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_orders_original_order_id_fkey"
            columns: ["original_order_id"]
            isOneToOne: false
            referencedRelation: "pos_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_orders_pos_customer_id_fkey"
            columns: ["pos_customer_id"]
            isOneToOne: false
            referencedRelation: "pos_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_orders_return_of_order_id_fkey"
            columns: ["return_of_order_id"]
            isOneToOne: false
            referencedRelation: "pos_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_orders_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "pos_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_orders_transferred_from_session_id_fkey"
            columns: ["transferred_from_session_id"]
            isOneToOne: false
            referencedRelation: "pos_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "product_warehouse_stock"
            referencedColumns: ["warehouse_id"]
          },
          {
            foreignKeyName: "pos_orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_payments: {
        Row: {
          amount: number
          change_amount: number
          change_currency: string | null
          cheque_date: string | null
          cheque_number: string | null
          created_at: string
          currency: string
          exchange_rate: number | null
          id: string
          notes: string | null
          order_id: string
          payment_method: string
          reference: string | null
          tendered: number
          user_id: string
        }
        Insert: {
          amount?: number
          change_amount?: number
          change_currency?: string | null
          cheque_date?: string | null
          cheque_number?: string | null
          created_at?: string
          currency?: string
          exchange_rate?: number | null
          id?: string
          notes?: string | null
          order_id: string
          payment_method?: string
          reference?: string | null
          tendered?: number
          user_id: string
        }
        Update: {
          amount?: number
          change_amount?: number
          change_currency?: string | null
          cheque_date?: string | null
          cheque_number?: string | null
          created_at?: string
          currency?: string
          exchange_rate?: number | null
          id?: string
          notes?: string | null
          order_id?: string
          payment_method?: string
          reference?: string | null
          tendered?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "pos_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_printers: {
        Row: {
          branch_id: string | null
          created_at: string | null
          id: string
          ip_address: string
          is_active: boolean | null
          is_default: boolean | null
          name: string
          paper_width: number
          port: number
          print_categories: string[] | null
          printer_type: string
          settings: Json
          station_ids: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string | null
          id?: string
          ip_address: string
          is_active?: boolean | null
          is_default?: boolean | null
          name: string
          paper_width?: number
          port?: number
          print_categories?: string[] | null
          printer_type?: string
          settings?: Json
          station_ids?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string | null
          id?: string
          ip_address?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          paper_width?: number
          port?: number
          print_categories?: string[] | null
          printer_type?: string
          settings?: Json
          station_ids?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_printers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_printers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_purchases: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          payment_type: string
          product_id: string | null
          quantity: number
          shift_id: string | null
          supplier_id: string | null
          total_amount: number
          unit_price: number
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_type?: string
          product_id?: string | null
          quantity?: number
          shift_id?: string | null
          supplier_id?: string | null
          total_amount?: number
          unit_price?: number
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_type?: string
          product_id?: string | null
          quantity?: number
          shift_id?: string | null
          supplier_id?: string | null
          total_amount?: number
          unit_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_purchases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_warehouse_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "pos_purchases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "pos_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sessions: {
        Row: {
          approved_by_pos_user_id: string | null
          cash_box_id: string | null
          cash_variance: number | null
          cashier_auth_user_id: string | null
          cashier_name: string | null
          cashier_pos_user_id: string | null
          closed_at: string | null
          closing_cash: number | null
          company_id: string
          created_at: string
          device_id: string | null
          expected_cash: number | null
          id: string
          is_deleted: boolean
          notes: string | null
          opened_at: string
          opening_cash: number
          state: string
          supervisor_approved: boolean | null
          supervisor_note: string | null
          terminal_id: string
          total_orders: number
          total_returns: number
          total_sales: number
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_by_pos_user_id?: string | null
          cash_box_id?: string | null
          cash_variance?: number | null
          cashier_auth_user_id?: string | null
          cashier_name?: string | null
          cashier_pos_user_id?: string | null
          closed_at?: string | null
          closing_cash?: number | null
          company_id: string
          created_at?: string
          device_id?: string | null
          expected_cash?: number | null
          id?: string
          is_deleted?: boolean
          notes?: string | null
          opened_at?: string
          opening_cash?: number
          state?: string
          supervisor_approved?: boolean | null
          supervisor_note?: string | null
          terminal_id: string
          total_orders?: number
          total_returns?: number
          total_sales?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_by_pos_user_id?: string | null
          cash_box_id?: string | null
          cash_variance?: number | null
          cashier_auth_user_id?: string | null
          cashier_name?: string | null
          cashier_pos_user_id?: string | null
          closed_at?: string | null
          closing_cash?: number | null
          company_id?: string
          created_at?: string
          device_id?: string | null
          expected_cash?: number | null
          id?: string
          is_deleted?: boolean
          notes?: string | null
          opened_at?: string
          opening_cash?: number
          state?: string
          supervisor_approved?: boolean | null
          supervisor_note?: string | null
          terminal_id?: string
          total_orders?: number
          total_returns?: number
          total_sales?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_sessions_approved_by_pos_user_id_fkey"
            columns: ["approved_by_pos_user_id"]
            isOneToOne: false
            referencedRelation: "pos_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sessions_cash_box_id_fkey"
            columns: ["cash_box_id"]
            isOneToOne: false
            referencedRelation: "cash_boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sessions_cashier_pos_user_id_fkey"
            columns: ["cashier_pos_user_id"]
            isOneToOne: false
            referencedRelation: "pos_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "pos_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sessions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "pos_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sessions_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "pos_terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_suppliers: {
        Row: {
          account_name: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          user_id: string
        }
        Insert: {
          account_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          user_id: string
        }
        Update: {
          account_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          user_id?: string
        }
        Relationships: []
      }
      pos_sync_log: {
        Row: {
          created_at: string | null
          device_id: string | null
          failed_count: number | null
          id: string
          offline_duration_minutes: number | null
          offline_started_at: string | null
          online_restored_at: string | null
          synced_count: number | null
          transactions_count: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          device_id?: string | null
          failed_count?: number | null
          id?: string
          offline_duration_minutes?: number | null
          offline_started_at?: string | null
          online_restored_at?: string | null
          synced_count?: number | null
          transactions_count?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          device_id?: string | null
          failed_count?: number | null
          id?: string
          offline_duration_minutes?: number | null
          offline_started_at?: string | null
          online_restored_at?: string | null
          synced_count?: number | null
          transactions_count?: number | null
          user_id?: string
        }
        Relationships: []
      }
      pos_terminals: {
        Row: {
          branch_id: string | null
          cash_account_code: string
          cogs_account_code: string
          company_id: string
          created_at: string
          id: string
          inventory_account_code: string
          is_active: boolean
          name: string
          receivable_account_code: string
          revenue_account_code: string
          settings: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          cash_account_code?: string
          cogs_account_code?: string
          company_id: string
          created_at?: string
          id?: string
          inventory_account_code?: string
          is_active?: boolean
          name?: string
          receivable_account_code?: string
          revenue_account_code?: string
          settings?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          branch_id?: string | null
          cash_account_code?: string
          cogs_account_code?: string
          company_id?: string
          created_at?: string
          id?: string
          inventory_account_code?: string
          is_active?: boolean
          name?: string
          receivable_account_code?: string
          revenue_account_code?: string
          settings?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_terminals_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_terminals_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_terminals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "pos_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_user_device_access: {
        Row: {
          can_login: boolean
          created_at: string
          device_id: string
          id: string
          pos_user_id: string
          user_id: string
        }
        Insert: {
          can_login?: boolean
          created_at?: string
          device_id: string
          id?: string
          pos_user_id: string
          user_id: string
        }
        Update: {
          can_login?: boolean
          created_at?: string
          device_id?: string
          id?: string
          pos_user_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_user_device_access_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "pos_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_user_device_access_pos_user_id_fkey"
            columns: ["pos_user_id"]
            isOneToOne: false
            referencedRelation: "pos_users"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_user_permissions: {
        Row: {
          add_customer: boolean
          allow_credit_sale: boolean
          can_add_inventory: boolean
          can_affect_inventory_on_purchase: boolean
          can_apply_discount: boolean
          can_cancel_invoices: boolean
          can_close_register: boolean
          can_create_expense_category: boolean
          can_create_product: boolean
          can_create_supplier: boolean
          can_edit_invoices: boolean
          can_edit_prices: boolean
          can_open_register: boolean
          can_pay_purchases_cash: boolean
          can_record_expenses: boolean
          can_record_purchases: boolean
          can_refund: boolean
          can_remove_cart_items: boolean | null
          can_view_invoice_history: boolean
          can_view_profits: boolean
          can_view_shift_details: boolean
          can_void_sales: boolean
          company_id: string
          created_at: string
          delete_products: boolean
          edit_cancel_invoices: boolean
          edit_customers: boolean
          edit_products: boolean
          export_reports: boolean
          id: string
          manage_products_categories: boolean
          max_discount_percent: number
          open_cash_drawer: boolean
          pos_user_id: string
          print_invoices: boolean
          require_manager_approval: boolean
          require_manager_for_invoices: boolean
          resend_invoice: boolean
          updated_at: string
          user_id: string
          view_customers: boolean
          view_inventory: boolean
          view_invoice_log: boolean
          view_sales_report: boolean
        }
        Insert: {
          add_customer?: boolean
          allow_credit_sale?: boolean
          can_add_inventory?: boolean
          can_affect_inventory_on_purchase?: boolean
          can_apply_discount?: boolean
          can_cancel_invoices?: boolean
          can_close_register?: boolean
          can_create_expense_category?: boolean
          can_create_product?: boolean
          can_create_supplier?: boolean
          can_edit_invoices?: boolean
          can_edit_prices?: boolean
          can_open_register?: boolean
          can_pay_purchases_cash?: boolean
          can_record_expenses?: boolean
          can_record_purchases?: boolean
          can_refund?: boolean
          can_remove_cart_items?: boolean | null
          can_view_invoice_history?: boolean
          can_view_profits?: boolean
          can_view_shift_details?: boolean
          can_void_sales?: boolean
          company_id: string
          created_at?: string
          delete_products?: boolean
          edit_cancel_invoices?: boolean
          edit_customers?: boolean
          edit_products?: boolean
          export_reports?: boolean
          id?: string
          manage_products_categories?: boolean
          max_discount_percent?: number
          open_cash_drawer?: boolean
          pos_user_id: string
          print_invoices?: boolean
          require_manager_approval?: boolean
          require_manager_for_invoices?: boolean
          resend_invoice?: boolean
          updated_at?: string
          user_id: string
          view_customers?: boolean
          view_inventory?: boolean
          view_invoice_log?: boolean
          view_sales_report?: boolean
        }
        Update: {
          add_customer?: boolean
          allow_credit_sale?: boolean
          can_add_inventory?: boolean
          can_affect_inventory_on_purchase?: boolean
          can_apply_discount?: boolean
          can_cancel_invoices?: boolean
          can_close_register?: boolean
          can_create_expense_category?: boolean
          can_create_product?: boolean
          can_create_supplier?: boolean
          can_edit_invoices?: boolean
          can_edit_prices?: boolean
          can_open_register?: boolean
          can_pay_purchases_cash?: boolean
          can_record_expenses?: boolean
          can_record_purchases?: boolean
          can_refund?: boolean
          can_remove_cart_items?: boolean | null
          can_view_invoice_history?: boolean
          can_view_profits?: boolean
          can_view_shift_details?: boolean
          can_void_sales?: boolean
          company_id?: string
          created_at?: string
          delete_products?: boolean
          edit_cancel_invoices?: boolean
          edit_customers?: boolean
          edit_products?: boolean
          export_reports?: boolean
          id?: string
          manage_products_categories?: boolean
          max_discount_percent?: number
          open_cash_drawer?: boolean
          pos_user_id?: string
          print_invoices?: boolean
          require_manager_approval?: boolean
          require_manager_for_invoices?: boolean
          resend_invoice?: boolean
          updated_at?: string
          user_id?: string
          view_customers?: boolean
          view_inventory?: boolean
          view_invoice_log?: boolean
          view_sales_report?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "pos_user_permissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "pos_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_user_permissions_pos_user_id_fkey"
            columns: ["pos_user_id"]
            isOneToOne: true
            referencedRelation: "pos_users"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_user_preferences: {
        Row: {
          auth_user_id: string
          created_at: string
          id: string
          preference_key: string
          preference_value: Json
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          id?: string
          preference_key: string
          preference_value?: Json
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          id?: string
          preference_key?: string
          preference_value?: Json
          updated_at?: string
        }
        Relationships: []
      }
      pos_users: {
        Row: {
          account_status: string | null
          auth_user_id: string | null
          avatar_url: string | null
          branch_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          email: string | null
          employee_id: string | null
          has_account: boolean | null
          id: string
          is_active: boolean
          is_call_center: boolean | null
          last_login_at: string | null
          must_change_password: boolean | null
          name: string
          phone: string | null
          pin_failed_attempts: number
          pin_hash: string
          pin_locked_until: string | null
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_status?: string | null
          auth_user_id?: string | null
          avatar_url?: string | null
          branch_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          employee_id?: string | null
          has_account?: boolean | null
          id?: string
          is_active?: boolean
          is_call_center?: boolean | null
          last_login_at?: string | null
          must_change_password?: boolean | null
          name: string
          phone?: string | null
          pin_failed_attempts?: number
          pin_hash: string
          pin_locked_until?: string | null
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_status?: string | null
          auth_user_id?: string | null
          avatar_url?: string | null
          branch_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          employee_id?: string | null
          has_account?: boolean | null
          id?: string
          is_active?: boolean
          is_call_center?: boolean | null
          last_login_at?: string | null
          must_change_password?: boolean | null
          name?: string
          phone?: string | null
          pin_failed_attempts?: number
          pin_hash?: string
          pin_locked_until?: string | null
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_users_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_users_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "pos_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_users_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_users_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      print_documents: {
        Row: {
          contact_id: string | null
          contact_name: string | null
          created_at: string | null
          data: Json
          document_date: string | null
          document_number: string
          id: string
          status: string | null
          template_type: string
          updated_at: string | null
          user_id: string
          validity_days: number | null
        }
        Insert: {
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string | null
          data?: Json
          document_date?: string | null
          document_number: string
          id?: string
          status?: string | null
          template_type: string
          updated_at?: string | null
          user_id: string
          validity_days?: number | null
        }
        Update: {
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string | null
          data?: Json
          document_date?: string | null
          document_number?: string
          id?: string
          status?: string | null
          template_type?: string
          updated_at?: string | null
          user_id?: string
          validity_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "print_documents_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      print_templates_designs: {
        Row: {
          created_at: string | null
          design_json: Json
          id: string
          is_default: boolean | null
          name: string
          template_type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          design_json?: Json
          id?: string
          is_default?: boolean | null
          name?: string
          template_type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          design_json?: Json
          id?: string
          is_default?: boolean | null
          name?: string
          template_type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      procurement_items: {
        Row: {
          category_id: string | null
          company_id: string | null
          default_price: number | null
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          sort_order: number | null
          unit: string
          user_id: string | null
        }
        Insert: {
          category_id?: string | null
          company_id?: string | null
          default_price?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          sort_order?: number | null
          unit?: string
          user_id?: string | null
        }
        Update: {
          category_id?: string | null
          company_id?: string | null
          default_price?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          sort_order?: number | null
          unit?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "item_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_order_items: {
        Row: {
          branch_id: string | null
          id: string
          item_name: string
          notes: string | null
          order_id: string
          product_id: string | null
          quantity: number | null
          total_price: number | null
          unit: string | null
          unit_price: number | null
        }
        Insert: {
          branch_id?: string | null
          id?: string
          item_name: string
          notes?: string | null
          order_id: string
          product_id?: string | null
          quantity?: number | null
          total_price?: number | null
          unit?: string | null
          unit_price?: number | null
        }
        Update: {
          branch_id?: string | null
          id?: string
          item_name?: string
          notes?: string | null
          order_id?: string
          product_id?: string | null
          quantity?: number | null
          total_price?: number | null
          unit?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_order_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_order_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "procurement_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "procurement_items"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_orders: {
        Row: {
          branch_id: string | null
          created_at: string | null
          created_by: string | null
          expected_delivery_date: string | null
          id: string
          notes: string | null
          order_date: string | null
          order_number: string | null
          status: string | null
          supplier_id: string
          total_amount: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string | null
          created_by?: string | null
          expected_delivery_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string | null
          order_number?: string | null
          status?: string | null
          supplier_id: string
          total_amount?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string | null
          created_by?: string | null
          expected_delivery_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string | null
          order_number?: string | null
          status?: string | null
          supplier_id?: string
          total_amount?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "pos_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_request_items: {
        Row: {
          category: string | null
          id: string
          item_name: string
          notes: string | null
          product_id: string | null
          quantity: number | null
          request_id: string | null
          total_price: number | null
          unit: string | null
          unit_price: number | null
        }
        Insert: {
          category?: string | null
          id?: string
          item_name: string
          notes?: string | null
          product_id?: string | null
          quantity?: number | null
          request_id?: string | null
          total_price?: number | null
          unit?: string | null
          unit_price?: number | null
        }
        Update: {
          category?: string | null
          id?: string
          item_name?: string
          notes?: string | null
          product_id?: string | null
          quantity?: number | null
          request_id?: string | null
          total_price?: number | null
          unit?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_request_items_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "procurement_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          id: string
          notes: string | null
          owner_id: string
          payment_method: string | null
          project_id: string
          rejection_reason: string | null
          request_date: string | null
          request_number: string | null
          status: string
          subtotal: number | null
          supplier_invoice_url: string | null
          supplier_name: string | null
          tax_amount: number | null
          total: number | null
          updated_at: string | null
          worker_id: string
          worker_name: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          owner_id: string
          payment_method?: string | null
          project_id: string
          rejection_reason?: string | null
          request_date?: string | null
          request_number?: string | null
          status?: string
          subtotal?: number | null
          supplier_invoice_url?: string | null
          supplier_name?: string | null
          tax_amount?: number | null
          total?: number | null
          updated_at?: string | null
          worker_id: string
          worker_name: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          owner_id?: string
          payment_method?: string | null
          project_id?: string
          rejection_reason?: string | null
          request_date?: string | null
          request_number?: string | null
          status?: string
          subtotal?: number | null
          supplier_invoice_url?: string | null
          supplier_name?: string | null
          tax_amount?: number | null
          total?: number | null
          updated_at?: string | null
          worker_id?: string
          worker_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "contractor_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      product_modifier_groups: {
        Row: {
          group_id: string
          id: string
          product_id: string
          sort_order: number | null
        }
        Insert: {
          group_id: string
          id?: string
          product_id: string
          sort_order?: number | null
        }
        Update: {
          group_id?: string
          id?: string
          product_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_modifier_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_modifier_groups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_warehouse_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_modifier_groups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          buy_price: number
          category: string
          color: string | null
          created_at: string
          default_supplier_id: string | null
          description: string | null
          has_warranty: boolean | null
          id: string
          image_url: string | null
          is_pos_available: boolean | null
          is_pos_product: boolean | null
          is_purchased: boolean | null
          is_sold: boolean | null
          is_weighted: boolean | null
          kitchen_station_id: string | null
          min_quantity: number
          name: string
          notes: string | null
          pos_category_id: string | null
          pos_sort_order: number | null
          print_station_ids: string[] | null
          product_type: string | null
          purchase_account_code: string | null
          quantity: number
          sales_account_code: string | null
          sell_price: number
          service_direction: string | null
          sku: string | null
          sort_order: number | null
          source: string | null
          tax_rate: number | null
          terms: string | null
          unit: string
          updated_at: string
          user_id: string
          warranty_duration: number | null
          warranty_notes: string | null
          warranty_type: string | null
          warranty_unit: string | null
        }
        Insert: {
          barcode?: string | null
          buy_price?: number
          category?: string
          color?: string | null
          created_at?: string
          default_supplier_id?: string | null
          description?: string | null
          has_warranty?: boolean | null
          id?: string
          image_url?: string | null
          is_pos_available?: boolean | null
          is_pos_product?: boolean | null
          is_purchased?: boolean | null
          is_sold?: boolean | null
          is_weighted?: boolean | null
          kitchen_station_id?: string | null
          min_quantity?: number
          name: string
          notes?: string | null
          pos_category_id?: string | null
          pos_sort_order?: number | null
          print_station_ids?: string[] | null
          product_type?: string | null
          purchase_account_code?: string | null
          quantity?: number
          sales_account_code?: string | null
          sell_price?: number
          service_direction?: string | null
          sku?: string | null
          sort_order?: number | null
          source?: string | null
          tax_rate?: number | null
          terms?: string | null
          unit?: string
          updated_at?: string
          user_id: string
          warranty_duration?: number | null
          warranty_notes?: string | null
          warranty_type?: string | null
          warranty_unit?: string | null
        }
        Update: {
          barcode?: string | null
          buy_price?: number
          category?: string
          color?: string | null
          created_at?: string
          default_supplier_id?: string | null
          description?: string | null
          has_warranty?: boolean | null
          id?: string
          image_url?: string | null
          is_pos_available?: boolean | null
          is_pos_product?: boolean | null
          is_purchased?: boolean | null
          is_sold?: boolean | null
          is_weighted?: boolean | null
          kitchen_station_id?: string | null
          min_quantity?: number
          name?: string
          notes?: string | null
          pos_category_id?: string | null
          pos_sort_order?: number | null
          print_station_ids?: string[] | null
          product_type?: string | null
          purchase_account_code?: string | null
          quantity?: number
          sales_account_code?: string | null
          sell_price?: number
          service_direction?: string | null
          sku?: string | null
          sort_order?: number | null
          source?: string | null
          tax_rate?: number | null
          terms?: string | null
          unit?: string
          updated_at?: string
          user_id?: string
          warranty_duration?: number | null
          warranty_notes?: string | null
          warranty_type?: string | null
          warranty_unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_default_supplier_id_fkey"
            columns: ["default_supplier_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_kitchen_station_id_fkey"
            columns: ["kitchen_station_id"]
            isOneToOne: false
            referencedRelation: "kitchen_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_pos_category_id_fkey"
            columns: ["pos_category_id"]
            isOneToOne: false
            referencedRelation: "pos_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          business_type: string | null
          company_id: string | null
          company_name: string | null
          country: string | null
          created_at: string
          display_name: string | null
          full_name: string | null
          has_employees: boolean | null
          has_inventory: boolean | null
          has_receivables: boolean | null
          help_views: number | null
          id: string
          invited_by: string | null
          is_suspended: boolean
          last_seen_at: string | null
          role: string
          setup_completed: boolean | null
          smart_accountant_onboarded: boolean | null
          smart_accountant_onboarded_at: string | null
          trial_welcome_seen: boolean
          trial_welcome_seen_at: string | null
          updated_at: string
          user_id: string
          work_field: string | null
        }
        Insert: {
          address?: string | null
          business_type?: string | null
          company_id?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          full_name?: string | null
          has_employees?: boolean | null
          has_inventory?: boolean | null
          has_receivables?: boolean | null
          help_views?: number | null
          id?: string
          invited_by?: string | null
          is_suspended?: boolean
          last_seen_at?: string | null
          role?: string
          setup_completed?: boolean | null
          smart_accountant_onboarded?: boolean | null
          smart_accountant_onboarded_at?: string | null
          trial_welcome_seen?: boolean
          trial_welcome_seen_at?: string | null
          updated_at?: string
          user_id: string
          work_field?: string | null
        }
        Update: {
          address?: string | null
          business_type?: string | null
          company_id?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          full_name?: string | null
          has_employees?: boolean | null
          has_inventory?: boolean | null
          has_receivables?: boolean | null
          help_views?: number | null
          id?: string
          invited_by?: string | null
          is_suspended?: boolean
          last_seen_at?: string | null
          role?: string
          setup_completed?: boolean | null
          smart_accountant_onboarded?: boolean | null
          smart_accountant_onboarded_at?: string | null
          trial_welcome_seen?: boolean
          trial_welcome_seen_at?: string | null
          updated_at?: string
          user_id?: string
          work_field?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      project_contracts: {
        Row: {
          advance_payment: number | null
          advance_payment_note: string | null
          client_address: string | null
          client_name: string
          client_phone: string | null
          contract_number: string | null
          contract_value: number | null
          created_at: string | null
          duration_text: string | null
          end_date: string | null
          id: string
          logo_url: string | null
          notes: string | null
          payment_terms: string | null
          project_id: string | null
          project_location: string | null
          project_name: string
          scope_items: string[] | null
          start_date: string | null
          status: string | null
          terms_disputes: string | null
          terms_obligations: string | null
          terms_payment: string | null
          total_expenses: number | null
          total_receipts: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          advance_payment?: number | null
          advance_payment_note?: string | null
          client_address?: string | null
          client_name: string
          client_phone?: string | null
          contract_number?: string | null
          contract_value?: number | null
          created_at?: string | null
          duration_text?: string | null
          end_date?: string | null
          id?: string
          logo_url?: string | null
          notes?: string | null
          payment_terms?: string | null
          project_id?: string | null
          project_location?: string | null
          project_name: string
          scope_items?: string[] | null
          start_date?: string | null
          status?: string | null
          terms_disputes?: string | null
          terms_obligations?: string | null
          terms_payment?: string | null
          total_expenses?: number | null
          total_receipts?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          advance_payment?: number | null
          advance_payment_note?: string | null
          client_address?: string | null
          client_name?: string
          client_phone?: string | null
          contract_number?: string | null
          contract_value?: number | null
          created_at?: string | null
          duration_text?: string | null
          end_date?: string | null
          id?: string
          logo_url?: string | null
          notes?: string | null
          payment_terms?: string | null
          project_id?: string | null
          project_location?: string | null
          project_name?: string
          scope_items?: string[] | null
          start_date?: string | null
          status?: string | null
          terms_disputes?: string | null
          terms_obligations?: string | null
          terms_payment?: string | null
          total_expenses?: number | null
          total_receipts?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_contracts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "contractor_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_workers: {
        Row: {
          assigned_at: string | null
          id: string
          owner_id: string
          project_id: string
          role: string
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          id?: string
          owner_id: string
          project_id: string
          role?: string
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          id?: string
          owner_id?: string
          project_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_workers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "contractor_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_invoice_items: {
        Row: {
          batch_no: string | null
          created_at: string | null
          discount_pct: number | null
          expiry_date: string | null
          id: string
          invoice_id: string
          notes: string | null
          previous_price: number | null
          price_change_pct: number | null
          product_id: string | null
          product_name: string
          production_date: string | null
          quantity: number
          tax_pct: number | null
          total_amount: number
          track_inventory: boolean | null
          unit: string | null
          unit_price: number
        }
        Insert: {
          batch_no?: string | null
          created_at?: string | null
          discount_pct?: number | null
          expiry_date?: string | null
          id?: string
          invoice_id: string
          notes?: string | null
          previous_price?: number | null
          price_change_pct?: number | null
          product_id?: string | null
          product_name: string
          production_date?: string | null
          quantity: number
          tax_pct?: number | null
          total_amount: number
          track_inventory?: boolean | null
          unit?: string | null
          unit_price: number
        }
        Update: {
          batch_no?: string | null
          created_at?: string | null
          discount_pct?: number | null
          expiry_date?: string | null
          id?: string
          invoice_id?: string
          notes?: string | null
          previous_price?: number | null
          price_change_pct?: number | null
          product_id?: string | null
          product_name?: string
          production_date?: string | null
          quantity?: number
          tax_pct?: number | null
          total_amount?: number
          track_inventory?: boolean | null
          unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_warehouse_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_invoices: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          branch_id: string | null
          created_at: string | null
          created_by: string | null
          discount_amount: number | null
          due_date: string | null
          id: string
          image_url: string | null
          invoice_date: string | null
          invoice_image_url: string | null
          invoice_number: string | null
          linked_transaction_id: string | null
          notes: string | null
          paid_amount: number | null
          payment_method: string | null
          procurement_order_id: string | null
          reference_no: string | null
          rejection_reason: string | null
          remaining_amount: number | null
          status: string | null
          subtotal: number | null
          supplier_id: string | null
          supplier_name: string | null
          tax_amount: number | null
          tax_rate: number | null
          total_amount: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string | null
          created_at?: string | null
          created_by?: string | null
          discount_amount?: number | null
          due_date?: string | null
          id?: string
          image_url?: string | null
          invoice_date?: string | null
          invoice_image_url?: string | null
          invoice_number?: string | null
          linked_transaction_id?: string | null
          notes?: string | null
          paid_amount?: number | null
          payment_method?: string | null
          procurement_order_id?: string | null
          reference_no?: string | null
          rejection_reason?: string | null
          remaining_amount?: number | null
          status?: string | null
          subtotal?: number | null
          supplier_id?: string | null
          supplier_name?: string | null
          tax_amount?: number | null
          tax_rate?: number | null
          total_amount?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string | null
          created_at?: string | null
          created_by?: string | null
          discount_amount?: number | null
          due_date?: string | null
          id?: string
          image_url?: string | null
          invoice_date?: string | null
          invoice_image_url?: string | null
          invoice_number?: string | null
          linked_transaction_id?: string | null
          notes?: string | null
          paid_amount?: number | null
          payment_method?: string | null
          procurement_order_id?: string | null
          reference_no?: string | null
          rejection_reason?: string | null
          remaining_amount?: number | null
          status?: string | null
          subtotal?: number | null
          supplier_id?: string | null
          supplier_name?: string | null
          tax_amount?: number | null
          tax_rate?: number | null
          total_amount?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_procurement_order_id_fkey"
            columns: ["procurement_order_id"]
            isOneToOne: false
            referencedRelation: "procurement_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "pos_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      qamar_order_items: {
        Row: {
          created_at: string
          id: string
          line_total: number | null
          note: string | null
          order_id: string
          price: number | null
          product_id: string | null
          product_image: string | null
          product_name: string
          quantity: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          line_total?: number | null
          note?: string | null
          order_id: string
          price?: number | null
          product_id?: string | null
          product_image?: string | null
          product_name?: string
          quantity?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number | null
          note?: string | null
          order_id?: string
          price?: number | null
          product_id?: string | null
          product_image?: string | null
          product_name?: string
          quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "qamar_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "qamar_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      qamar_order_statuses: {
        Row: {
          color: string | null
          created_at: string
          effect: string | null
          id: string
          is_default: boolean | null
          name: string
          sort_order: number | null
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          effect?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          sort_order?: number | null
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          effect?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          sort_order?: number | null
          user_id?: string
        }
        Relationships: []
      }
      qamar_orders: {
        Row: {
          agent_id: string | null
          agent_name: string | null
          all_notes: string | null
          amount_paid: number | null
          contact_id: string | null
          cost_breakdown: Json | null
          created_at: string
          customer_address: string | null
          customer_city: string | null
          customer_name: string
          customer_notes: string | null
          customer_phone: string | null
          delivery: Json | null
          deposit_amount: number | null
          deposit_paid_at: string | null
          discount: number | null
          driver_cost: number | null
          gross_profit: number | null
          id: string
          invoice_number: string | null
          invoiced_at: string | null
          last_synced_at: string | null
          linked_invoice_id: string | null
          net_delivery: number | null
          payment: Json | null
          payment_method: string | null
          payment_status: string | null
          priority: string | null
          production_cost: number | null
          production_notes: string | null
          production_status: string | null
          production_sub_stage: string | null
          reference_number: string | null
          remaining_amount: number | null
          remaining_paid_at: string | null
          shipping_cost: number | null
          shipping_estimate: number | null
          shipping_final: number | null
          shipping_notes: string | null
          shipping_settled: boolean | null
          shipping_settled_at: string | null
          shipping_settled_by: string | null
          source: string | null
          source_key: string | null
          status: string | null
          subtotal: number | null
          sync_type: string | null
          synced_at: string | null
          total: number | null
          type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          agent_name?: string | null
          all_notes?: string | null
          amount_paid?: number | null
          contact_id?: string | null
          cost_breakdown?: Json | null
          created_at?: string
          customer_address?: string | null
          customer_city?: string | null
          customer_name?: string
          customer_notes?: string | null
          customer_phone?: string | null
          delivery?: Json | null
          deposit_amount?: number | null
          deposit_paid_at?: string | null
          discount?: number | null
          driver_cost?: number | null
          gross_profit?: number | null
          id?: string
          invoice_number?: string | null
          invoiced_at?: string | null
          last_synced_at?: string | null
          linked_invoice_id?: string | null
          net_delivery?: number | null
          payment?: Json | null
          payment_method?: string | null
          payment_status?: string | null
          priority?: string | null
          production_cost?: number | null
          production_notes?: string | null
          production_status?: string | null
          production_sub_stage?: string | null
          reference_number?: string | null
          remaining_amount?: number | null
          remaining_paid_at?: string | null
          shipping_cost?: number | null
          shipping_estimate?: number | null
          shipping_final?: number | null
          shipping_notes?: string | null
          shipping_settled?: boolean | null
          shipping_settled_at?: string | null
          shipping_settled_by?: string | null
          source?: string | null
          source_key?: string | null
          status?: string | null
          subtotal?: number | null
          sync_type?: string | null
          synced_at?: string | null
          total?: number | null
          type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string | null
          agent_name?: string | null
          all_notes?: string | null
          amount_paid?: number | null
          contact_id?: string | null
          cost_breakdown?: Json | null
          created_at?: string
          customer_address?: string | null
          customer_city?: string | null
          customer_name?: string
          customer_notes?: string | null
          customer_phone?: string | null
          delivery?: Json | null
          deposit_amount?: number | null
          deposit_paid_at?: string | null
          discount?: number | null
          driver_cost?: number | null
          gross_profit?: number | null
          id?: string
          invoice_number?: string | null
          invoiced_at?: string | null
          last_synced_at?: string | null
          linked_invoice_id?: string | null
          net_delivery?: number | null
          payment?: Json | null
          payment_method?: string | null
          payment_status?: string | null
          priority?: string | null
          production_cost?: number | null
          production_notes?: string | null
          production_status?: string | null
          production_sub_stage?: string | null
          reference_number?: string | null
          remaining_amount?: number | null
          remaining_paid_at?: string | null
          shipping_cost?: number | null
          shipping_estimate?: number | null
          shipping_final?: number | null
          shipping_notes?: string | null
          shipping_settled?: boolean | null
          shipping_settled_at?: string | null
          shipping_settled_by?: string | null
          source?: string | null
          source_key?: string | null
          status?: string | null
          subtotal?: number | null
          sync_type?: string | null
          synced_at?: string | null
          total?: number | null
          type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qamar_orders_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      qr_tokens: {
        Row: {
          branch_id: string
          created_at: string
          expires_at: string
          id: string
          token: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          expires_at: string
          id?: string
          token: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "qr_tokens_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_tokens_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          client_address: string | null
          client_name: string
          created_at: string
          discount_amount: number
          discount_percent: number
          id: string
          items: Json
          notes: string | null
          payment_terms: string | null
          quote_date: string
          quote_number: string
          status: string
          subtotal: number
          tax_amount: number
          tax_enabled: boolean
          total: number
          updated_at: string
          user_id: string
          validity_days: number
          workshop_id: string | null
        }
        Insert: {
          client_address?: string | null
          client_name?: string
          created_at?: string
          discount_amount?: number
          discount_percent?: number
          id?: string
          items?: Json
          notes?: string | null
          payment_terms?: string | null
          quote_date?: string
          quote_number: string
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_enabled?: boolean
          total?: number
          updated_at?: string
          user_id: string
          validity_days?: number
          workshop_id?: string | null
        }
        Update: {
          client_address?: string | null
          client_name?: string
          created_at?: string
          discount_amount?: number
          discount_percent?: number
          id?: string
          items?: Json
          notes?: string | null
          payment_terms?: string | null
          quote_date?: string
          quote_number?: string
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_enabled?: boolean
          total?: number
          updated_at?: string
          user_id?: string
          validity_days?: number
          workshop_id?: string | null
        }
        Relationships: []
      }
      receipt_vouchers: {
        Row: {
          amount: number
          attachments: Json | null
          auto_allocate: boolean | null
          bank_account_id: string | null
          bank_name: string | null
          cash_box_id: string | null
          check_date: string | null
          check_number: string | null
          contact_id: string | null
          contact_name: string | null
          created_at: string | null
          deposit_account_code: string | null
          id: string
          linked_transaction_id: string | null
          notes: string | null
          payment_date: string
          payment_method: string | null
          receipt_number: string | null
          status: string | null
          updated_at: string | null
          user_id: string
          workshop_id: string | null
        }
        Insert: {
          amount?: number
          attachments?: Json | null
          auto_allocate?: boolean | null
          bank_account_id?: string | null
          bank_name?: string | null
          cash_box_id?: string | null
          check_date?: string | null
          check_number?: string | null
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string | null
          deposit_account_code?: string | null
          id?: string
          linked_transaction_id?: string | null
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          receipt_number?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
          workshop_id?: string | null
        }
        Update: {
          amount?: number
          attachments?: Json | null
          auto_allocate?: boolean | null
          bank_account_id?: string | null
          bank_name?: string | null
          cash_box_id?: string | null
          check_date?: string | null
          check_number?: string | null
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string | null
          deposit_account_code?: string | null
          id?: string
          linked_transaction_id?: string | null
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          receipt_number?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
          workshop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipt_vouchers_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_vouchers_cash_box_id_fkey"
            columns: ["cash_box_id"]
            isOneToOne: false
            referencedRelation: "cash_boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_vouchers_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_vouchers_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_invoices: {
        Row: {
          auto_send: boolean | null
          contact_id: string | null
          contact_name: string
          created_at: string | null
          currency: string | null
          discount_amount: number | null
          end_date: string | null
          frequency: string
          generated_count: number | null
          id: string
          interval_value: number
          invoice_type: string
          is_active: boolean | null
          items: Json
          last_generated_at: string | null
          next_due_date: string
          notes: string | null
          payment_method: string | null
          payment_terms: string | null
          start_date: string
          subtotal: number
          tax_amount: number | null
          total_amount: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          auto_send?: boolean | null
          contact_id?: string | null
          contact_name: string
          created_at?: string | null
          currency?: string | null
          discount_amount?: number | null
          end_date?: string | null
          frequency?: string
          generated_count?: number | null
          id?: string
          interval_value?: number
          invoice_type?: string
          is_active?: boolean | null
          items?: Json
          last_generated_at?: string | null
          next_due_date?: string
          notes?: string | null
          payment_method?: string | null
          payment_terms?: string | null
          start_date?: string
          subtotal?: number
          tax_amount?: number | null
          total_amount?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          auto_send?: boolean | null
          contact_id?: string | null
          contact_name?: string
          created_at?: string | null
          currency?: string | null
          discount_amount?: number | null
          end_date?: string | null
          frequency?: string
          generated_count?: number | null
          id?: string
          interval_value?: number
          invoice_type?: string
          is_active?: boolean | null
          items?: Json
          last_generated_at?: string | null
          next_due_date?: string
          notes?: string | null
          payment_method?: string | null
          payment_terms?: string | null
          start_date?: string
          subtotal?: number
          tax_amount?: number | null
          total_amount?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_invoices_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      report_folders: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          name: string
          parent_id: string | null
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "report_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_sections: {
        Row: {
          branch_id: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_sections_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_sections_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_tables: {
        Row: {
          created_at: string | null
          current_guests: number | null
          current_order_id: string | null
          height: number | null
          id: string
          is_active: boolean | null
          name: string
          occupied_at: string | null
          pos_x: number | null
          pos_y: number | null
          rotation: number | null
          seats: number | null
          section_id: string | null
          shape: string | null
          status: string | null
          updated_at: string | null
          user_id: string
          width: number | null
        }
        Insert: {
          created_at?: string | null
          current_guests?: number | null
          current_order_id?: string | null
          height?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          occupied_at?: string | null
          pos_x?: number | null
          pos_y?: number | null
          rotation?: number | null
          seats?: number | null
          section_id?: string | null
          shape?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
          width?: number | null
        }
        Update: {
          created_at?: string | null
          current_guests?: number | null
          current_order_id?: string | null
          height?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          occupied_at?: string | null
          pos_x?: number | null
          pos_y?: number | null
          rotation?: number | null
          seats?: number | null
          section_id?: string | null
          shape?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_tables_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "restaurant_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      return_items: {
        Row: {
          created_at: string
          description: string
          discount: number
          id: string
          line_total: number
          product_id: string | null
          quantity: number
          return_id: string
          source_invoice_item_id: string | null
          tax_amount: number
          tax_rate: number
          unit_price: number
          user_id: string
        }
        Insert: {
          created_at?: string
          description: string
          discount?: number
          id?: string
          line_total?: number
          product_id?: string | null
          quantity?: number
          return_id: string
          source_invoice_item_id?: string | null
          tax_amount?: number
          tax_rate?: number
          unit_price?: number
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          discount?: number
          id?: string
          line_total?: number
          product_id?: string | null
          quantity?: number
          return_id?: string
          source_invoice_item_id?: string | null
          tax_amount?: number
          tax_rate?: number
          unit_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_warehouse_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "returns"
            referencedColumns: ["id"]
          },
        ]
      }
      returns: {
        Row: {
          company_id: string | null
          contact_id: string | null
          contact_name: string | null
          created_at: string
          discount_amount: number
          id: string
          is_deleted: boolean
          journal_entry_id: string | null
          notes: string | null
          reason: string | null
          refund_account_code: string | null
          refund_method: string | null
          related_invoice_id: string | null
          return_date: string
          return_number: string
          return_type: Database["public"]["Enums"]["return_type_enum"]
          status: Database["public"]["Enums"]["return_status_enum"]
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string
          discount_amount?: number
          id?: string
          is_deleted?: boolean
          journal_entry_id?: string | null
          notes?: string | null
          reason?: string | null
          refund_account_code?: string | null
          refund_method?: string | null
          related_invoice_id?: string | null
          return_date?: string
          return_number: string
          return_type: Database["public"]["Enums"]["return_type_enum"]
          status?: Database["public"]["Enums"]["return_status_enum"]
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string
          discount_amount?: number
          id?: string
          is_deleted?: boolean
          journal_entry_id?: string | null
          notes?: string | null
          reason?: string | null
          refund_account_code?: string | null
          refund_method?: string | null
          related_invoice_id?: string | null
          return_date?: string
          return_number?: string
          return_type?: Database["public"]["Enums"]["return_type_enum"]
          status?: Database["public"]["Enums"]["return_status_enum"]
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "returns_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_related_invoice_id_fkey"
            columns: ["related_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_related_invoice_id_fkey"
            columns: ["related_invoice_id"]
            isOneToOne: false
            referencedRelation: "v_drift_invoice_no_link"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          can_approve: boolean
          can_delete: boolean
          can_read: boolean
          can_write: boolean
          created_at: string
          id: string
          module: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          can_approve?: boolean
          can_delete?: boolean
          can_read?: boolean
          can_write?: boolean
          created_at?: string
          id?: string
          module: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          can_approve?: boolean
          can_delete?: boolean
          can_read?: boolean
          can_write?: boolean
          created_at?: string
          id?: string
          module?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      sales_representatives: {
        Row: {
          auth_user_id: string | null
          cash_box_id: string | null
          collection_commission_rate: number
          created_at: string
          default_warehouse_id: string | null
          email: string | null
          employee_id: string | null
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
          username: string | null
        }
        Insert: {
          auth_user_id?: string | null
          cash_box_id?: string | null
          collection_commission_rate?: number
          created_at?: string
          default_warehouse_id?: string | null
          email?: string | null
          employee_id?: string | null
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
          username?: string | null
        }
        Update: {
          auth_user_id?: string | null
          cash_box_id?: string | null
          collection_commission_rate?: number
          created_at?: string
          default_warehouse_id?: string | null
          email?: string | null
          employee_id?: string | null
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
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_representatives_cash_box_id_fkey"
            columns: ["cash_box_id"]
            isOneToOne: false
            referencedRelation: "cash_boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_representatives_default_warehouse_id_fkey"
            columns: ["default_warehouse_id"]
            isOneToOne: false
            referencedRelation: "product_warehouse_stock"
            referencedColumns: ["warehouse_id"]
          },
          {
            foreignKeyName: "sales_representatives_default_warehouse_id_fkey"
            columns: ["default_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_representatives_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_representatives_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      sami_leads: {
        Row: {
          business_type: string | null
          conversation_log: Json | null
          created_at: string
          id: string
          is_read: boolean | null
          name: string
          notes: string | null
          phone: string
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          business_type?: string | null
          conversation_log?: Json | null
          created_at?: string
          id?: string
          is_read?: boolean | null
          name: string
          notes?: string | null
          phone: string
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          business_type?: string | null
          conversation_log?: Json | null
          created_at?: string
          id?: string
          is_read?: boolean | null
          name?: string
          notes?: string | null
          phone?: string
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      sensitive_data_audit: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          record_id: string | null
          table_name: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          record_id?: string | null
          table_name: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          record_id?: string | null
          table_name?: string
          user_id?: string
        }
        Relationships: []
      }
      shared_statements: {
        Row: {
          balance_amount: number | null
          company_id: string | null
          contact_id: string | null
          contact_name: string | null
          created_at: string | null
          created_by: string | null
          date_from: string
          date_to: string
          expires_at: string | null
          id: string
          token: string
          user_id: string
          view_count: number | null
          viewed_at: string | null
        }
        Insert: {
          balance_amount?: number | null
          company_id?: string | null
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string | null
          created_by?: string | null
          date_from: string
          date_to: string
          expires_at?: string | null
          id?: string
          token?: string
          user_id: string
          view_count?: number | null
          viewed_at?: string | null
        }
        Update: {
          balance_amount?: number | null
          company_id?: string | null
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string | null
          created_by?: string | null
          date_from?: string
          date_to?: string
          expires_at?: string | null
          id?: string
          token?: string
          user_id?: string
          view_count?: number | null
          viewed_at?: string | null
        }
        Relationships: []
      }
      shift_templates: {
        Row: {
          code: string
          color: string
          company_id: string
          created_at: string
          crosses_midnight: boolean
          end_time: string
          id: string
          is_active: boolean
          name_ar: string
          start_time: string
          updated_at: string
        }
        Insert: {
          code: string
          color?: string
          company_id: string
          created_at?: string
          crosses_midnight?: boolean
          end_time: string
          id?: string
          is_active?: boolean
          name_ar: string
          start_time: string
          updated_at?: string
        }
        Update: {
          code?: string
          color?: string
          company_id?: string
          created_at?: string
          crosses_midnight?: boolean
          end_time?: string
          id?: string
          is_active?: boolean
          name_ar?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: []
      }
      statement_send_log: {
        Row: {
          balance_at_send: number | null
          company_id: string | null
          contact_id: string | null
          contact_name: string | null
          contact_phone: string | null
          id: string
          sent_at: string | null
          sent_by: string | null
          sent_via: string | null
          shared_statement_id: string | null
          user_id: string
        }
        Insert: {
          balance_at_send?: number | null
          company_id?: string | null
          contact_id?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          id?: string
          sent_at?: string | null
          sent_by?: string | null
          sent_via?: string | null
          shared_statement_id?: string | null
          user_id: string
        }
        Update: {
          balance_at_send?: number | null
          company_id?: string | null
          contact_id?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          id?: string
          sent_at?: string | null
          sent_by?: string | null
          sent_via?: string | null
          shared_statement_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "statement_send_log_shared_statement_id_fkey"
            columns: ["shared_statement_id"]
            isOneToOne: false
            referencedRelation: "shared_statements"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_alerts: {
        Row: {
          alert_type: string
          created_at: string
          id: string
          is_resolved: boolean | null
          product_id: string
          product_name: string | null
          quantity_after: number | null
          quantity_before: number | null
          quantity_requested: number | null
          resolved_at: string | null
          source: string | null
          source_reference: string | null
          user_id: string
        }
        Insert: {
          alert_type?: string
          created_at?: string
          id?: string
          is_resolved?: boolean | null
          product_id: string
          product_name?: string | null
          quantity_after?: number | null
          quantity_before?: number | null
          quantity_requested?: number | null
          resolved_at?: string | null
          source?: string | null
          source_reference?: string | null
          user_id: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          id?: string
          is_resolved?: boolean | null
          product_id?: string
          product_name?: string | null
          quantity_after?: number | null
          quantity_before?: number | null
          quantity_requested?: number | null
          resolved_at?: string | null
          source?: string | null
          source_reference?: string | null
          user_id?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          created_at: string
          id: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          notes: string | null
          product_id: string
          quantity: number
          reference_id: string | null
          reference_note: string | null
          reference_type: string | null
          unit_cost: number | null
          user_id: string
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          notes?: string | null
          product_id: string
          quantity: number
          reference_id?: string | null
          reference_note?: string | null
          reference_type?: string | null
          unit_cost?: number | null
          user_id: string
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          movement_type?: Database["public"]["Enums"]["stock_movement_type"]
          notes?: string | null
          product_id?: string
          quantity?: number
          reference_id?: string | null
          reference_note?: string | null
          reference_type?: string | null
          unit_cost?: number | null
          user_id?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_warehouse_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "product_warehouse_stock"
            referencedColumns: ["warehouse_id"]
          },
          {
            foreignKeyName: "stock_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfer_items: {
        Row: {
          created_at: string
          id: string
          line_total: number
          notes: string | null
          product_id: string
          product_name: string
          quantity: number
          transfer_id: string
          unit: string | null
          unit_cost: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          line_total?: number
          notes?: string | null
          product_id: string
          product_name: string
          quantity: number
          transfer_id: string
          unit?: string | null
          unit_cost?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number
          notes?: string | null
          product_id?: string
          product_name?: string
          quantity?: number
          transfer_id?: string
          unit?: string | null
          unit_cost?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfer_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_warehouse_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_transfer_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "stock_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfers: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          from_warehouse_id: string | null
          id: string
          notes: string | null
          sales_rep_id: string | null
          status: string
          to_warehouse_id: string | null
          total_items: number
          total_quantity: number
          total_value: number
          transfer_date: string
          transfer_number: string
          transfer_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          from_warehouse_id?: string | null
          id?: string
          notes?: string | null
          sales_rep_id?: string | null
          status?: string
          to_warehouse_id?: string | null
          total_items?: number
          total_quantity?: number
          total_value?: number
          transfer_date?: string
          transfer_number: string
          transfer_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          from_warehouse_id?: string | null
          id?: string
          notes?: string | null
          sales_rep_id?: string | null
          status?: string
          to_warehouse_id?: string | null
          total_items?: number
          total_quantity?: number
          total_value?: number
          transfer_date?: string
          transfer_number?: string
          transfer_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_from_warehouse_id_fkey"
            columns: ["from_warehouse_id"]
            isOneToOne: false
            referencedRelation: "product_warehouse_stock"
            referencedColumns: ["warehouse_id"]
          },
          {
            foreignKeyName: "stock_transfers_from_warehouse_id_fkey"
            columns: ["from_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_sales_rep_id_fkey"
            columns: ["sales_rep_id"]
            isOneToOne: false
            referencedRelation: "sales_representatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_to_warehouse_id_fkey"
            columns: ["to_warehouse_id"]
            isOneToOne: false
            referencedRelation: "product_warehouse_stock"
            referencedColumns: ["warehouse_id"]
          },
          {
            foreignKeyName: "stock_transfers_to_warehouse_id_fkey"
            columns: ["to_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          agreement_type: string | null
          auto_renew: boolean | null
          billing_cycle: string
          cancelled_at: string | null
          company_id: string | null
          created_at: string
          current_period_end: string
          current_period_start: string
          custom_amount: number | null
          custom_currency: string | null
          id: string
          last_notified_at: string | null
          notified_days: number[] | null
          plan_id: string
          plan_key: string | null
          status: string
          trial_ends_at: string | null
          trial_starts_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agreement_type?: string | null
          auto_renew?: boolean | null
          billing_cycle?: string
          cancelled_at?: string | null
          company_id?: string | null
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          custom_amount?: number | null
          custom_currency?: string | null
          id?: string
          last_notified_at?: string | null
          notified_days?: number[] | null
          plan_id: string
          plan_key?: string | null
          status?: string
          trial_ends_at?: string | null
          trial_starts_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agreement_type?: string | null
          auto_renew?: boolean | null
          billing_cycle?: string
          cancelled_at?: string | null
          company_id?: string | null
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          custom_amount?: number | null
          custom_currency?: string | null
          id?: string
          last_notified_at?: string | null
          notified_days?: number[] | null
          plan_id?: string
          plan_key?: string | null
          status?: string
          trial_ends_at?: string | null
          trial_starts_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admin_audit_logs: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      superadmin_users: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          role: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          role?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          role?: string | null
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          address: string | null
          company_name: string
          contact_person: string | null
          created_at: string | null
          credit_limit: number | null
          email: string | null
          id: string
          is_active: boolean | null
          notes: string | null
          payment_terms: string | null
          phone: string | null
          tax_number: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          company_name: string
          contact_person?: string | null
          created_at?: string | null
          credit_limit?: number | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          tax_number?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          company_name?: string
          contact_person?: string | null
          created_at?: string | null
          credit_limit?: number | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          tax_number?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          created_at: string
          description: string | null
          id: string
          priority: string
          requested_changes: Json | null
          sector: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          requested_changes?: Json | null
          sector?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          requested_changes?: Json | null
          sector?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      sync_audit_log: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          reference: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          reference?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          reference?: string | null
          user_id?: string
        }
        Relationships: []
      }
      table_reservations: {
        Row: {
          created_at: string | null
          duration_minutes: number | null
          guest_name: string
          guest_phone: string | null
          id: string
          notes: string | null
          party_size: number | null
          reservation_date: string
          reservation_time: string
          status: string | null
          table_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          duration_minutes?: number | null
          guest_name: string
          guest_phone?: string | null
          id?: string
          notes?: string | null
          party_size?: number | null
          reservation_date: string
          reservation_time: string
          status?: string | null
          table_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          duration_minutes?: number | null
          guest_name?: string
          guest_phone?: string | null
          id?: string
          notes?: string | null
          party_size?: number | null
          reservation_date?: string
          reservation_time?: string
          status?: string | null
          table_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_reservations_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      task_history: {
        Row: {
          action: string
          created_at: string | null
          id: string
          new_value: string | null
          note: string | null
          old_value: string | null
          task_id: string | null
          task_user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          new_value?: string | null
          note?: string | null
          old_value?: string | null
          task_id?: string | null
          task_user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          new_value?: string | null
          note?: string | null
          old_value?: string | null
          task_id?: string | null
          task_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_history_task_user_id_fkey"
            columns: ["task_user_id"]
            isOneToOne: false
            referencedRelation: "task_users"
            referencedColumns: ["id"]
          },
        ]
      }
      task_users: {
        Row: {
          avatar_color: string | null
          created_at: string | null
          full_name: string
          id: string
          is_active: boolean | null
          last_login_at: string | null
          password_hash: string
          role: string | null
          user_id: string
          username: string
        }
        Insert: {
          avatar_color?: string | null
          created_at?: string | null
          full_name: string
          id?: string
          is_active?: boolean | null
          last_login_at?: string | null
          password_hash: string
          role?: string | null
          user_id: string
          username: string
        }
        Update: {
          avatar_color?: string | null
          created_at?: string | null
          full_name?: string
          id?: string
          is_active?: boolean | null
          last_login_at?: string | null
          password_hash?: string
          role?: string | null
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assigned_at: string | null
          assigned_by_name: string | null
          assigned_to: string | null
          category: string | null
          completed_at: string | null
          completed_by: string | null
          completion_note: string | null
          created_at: string | null
          created_by: string | null
          created_by_portal: boolean | null
          description: string | null
          due_date: string | null
          due_time: string | null
          id: string
          is_visible_to_all: boolean | null
          portal_company_id: string | null
          priority: string
          status: string
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by_name?: string | null
          assigned_to?: string | null
          category?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completion_note?: string | null
          created_at?: string | null
          created_by?: string | null
          created_by_portal?: boolean | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          id?: string
          is_visible_to_all?: boolean | null
          portal_company_id?: string | null
          priority?: string
          status?: string
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by_name?: string | null
          assigned_to?: string | null
          category?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completion_note?: string | null
          created_at?: string | null
          created_by?: string | null
          created_by_portal?: boolean | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          id?: string
          is_visible_to_all?: boolean | null
          portal_company_id?: string | null
          priority?: string
          status?: string
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "task_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "task_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "task_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_categories: {
        Row: {
          code: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          name: string
          rate: number | null
          tax_type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name: string
          rate?: number | null
          tax_type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          rate?: number | null
          tax_type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tax_ledger: {
        Row: {
          created_at: string | null
          id: string
          invoice_number: string | null
          is_deductible: boolean | null
          net_amount: number | null
          notes: string | null
          party_name: string | null
          party_tax_number: string | null
          period_month: number
          period_year: number
          reference_id: string | null
          reference_type: string
          tax_amount: number | null
          tax_category: string | null
          tax_rate: number | null
          tax_type: string
          transaction_date: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          invoice_number?: string | null
          is_deductible?: boolean | null
          net_amount?: number | null
          notes?: string | null
          party_name?: string | null
          party_tax_number?: string | null
          period_month: number
          period_year: number
          reference_id?: string | null
          reference_type: string
          tax_amount?: number | null
          tax_category?: string | null
          tax_rate?: number | null
          tax_type: string
          transaction_date: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          invoice_number?: string | null
          is_deductible?: boolean | null
          net_amount?: number | null
          notes?: string | null
          party_name?: string | null
          party_tax_number?: string | null
          period_month?: number
          period_year?: number
          reference_id?: string | null
          reference_type?: string
          tax_amount?: number | null
          tax_category?: string | null
          tax_rate?: number | null
          tax_type?: string
          transaction_date?: string
          user_id?: string
        }
        Relationships: []
      }
      tax_settings: {
        Row: {
          created_at: string | null
          fiscal_year_start: number | null
          id: string
          input_tax_account_code: string | null
          is_active: boolean | null
          output_tax_account_code: string | null
          payable_tax_account_code: string | null
          prices_include_tax: boolean | null
          refundable_tax_account_code: string | null
          registration_type: string | null
          report_due_day: number | null
          tax_name: string | null
          tax_number: string | null
          tax_rate: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          fiscal_year_start?: number | null
          id?: string
          input_tax_account_code?: string | null
          is_active?: boolean | null
          output_tax_account_code?: string | null
          payable_tax_account_code?: string | null
          prices_include_tax?: boolean | null
          refundable_tax_account_code?: string | null
          registration_type?: string | null
          report_due_day?: number | null
          tax_name?: string | null
          tax_number?: string | null
          tax_rate?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          fiscal_year_start?: number | null
          id?: string
          input_tax_account_code?: string | null
          is_active?: boolean | null
          output_tax_account_code?: string | null
          payable_tax_account_code?: string | null
          prices_include_tax?: boolean | null
          refundable_tax_account_code?: string | null
          registration_type?: string | null
          report_due_day?: number | null
          tax_name?: string | null
          tax_number?: string | null
          tax_rate?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tax_submissions: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          input_tax: number | null
          net_tax: number | null
          notes: string | null
          output_tax: number | null
          payment_amount: number | null
          payment_date: string | null
          payment_reference: string | null
          period_month: number
          period_year: number
          refund_amount: number | null
          status: string | null
          submission_date: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          input_tax?: number | null
          net_tax?: number | null
          notes?: string | null
          output_tax?: number | null
          payment_amount?: number | null
          payment_date?: string | null
          payment_reference?: string | null
          period_month: number
          period_year: number
          refund_amount?: number | null
          status?: string | null
          submission_date?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          input_tax?: number | null
          net_tax?: number | null
          notes?: string | null
          output_tax?: number | null
          payment_amount?: number | null
          payment_date?: string | null
          payment_reference?: string | null
          period_month?: number
          period_year?: number
          refund_amount?: number | null
          status?: string | null
          submission_date?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      termination_records: {
        Row: {
          advance_balance: number | null
          created_at: string | null
          current_month_salary: number | null
          employee_id: string
          id: string
          is_paid: boolean | null
          notes: string | null
          other_deductions: number | null
          paid_date: string | null
          severance_pay: number | null
          termination_date: string
          termination_reason: string | null
          total_dues: number | null
          unused_leave_pay: number | null
          user_id: string
          years_worked: number | null
        }
        Insert: {
          advance_balance?: number | null
          created_at?: string | null
          current_month_salary?: number | null
          employee_id: string
          id?: string
          is_paid?: boolean | null
          notes?: string | null
          other_deductions?: number | null
          paid_date?: string | null
          severance_pay?: number | null
          termination_date: string
          termination_reason?: string | null
          total_dues?: number | null
          unused_leave_pay?: number | null
          user_id: string
          years_worked?: number | null
        }
        Update: {
          advance_balance?: number | null
          created_at?: string | null
          current_month_salary?: number | null
          employee_id?: string
          id?: string
          is_paid?: boolean | null
          notes?: string | null
          other_deductions?: number | null
          paid_date?: string | null
          severance_pay?: number | null
          termination_date?: string
          termination_reason?: string | null
          total_dues?: number | null
          unused_leave_pay?: number | null
          user_id?: string
          years_worked?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "termination_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "termination_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_type: string | null
          file_url: string
          id: string
          ticket_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_type?: string | null
          file_url: string
          id?: string
          ticket_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_type?: string | null
          file_url?: string
          id?: string
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          is_internal: boolean
          ticket_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id_credit: string | null
          account_id_debit: string | null
          amount: number
          contact_id: string | null
          cost_center_name: string | null
          created_at: string
          credit_account_code: string
          currency: string
          debit_account_code: string
          description: string
          exchange_rate: number | null
          expense_category: string | null
          foreign_amount: number | null
          id: string
          idempotency_key: string | null
          is_deleted: boolean | null
          is_opening_balance: boolean | null
          notes: string | null
          payment_method: string | null
          reference: string | null
          return_id: string | null
          reversed_by_id: string | null
          transaction_date: string
          transaction_type: string
          updated_at: string
          user_id: string
          workshop_id: string | null
        }
        Insert: {
          account_id_credit?: string | null
          account_id_debit?: string | null
          amount?: number
          contact_id?: string | null
          cost_center_name?: string | null
          created_at?: string
          credit_account_code: string
          currency?: string
          debit_account_code: string
          description: string
          exchange_rate?: number | null
          expense_category?: string | null
          foreign_amount?: number | null
          id?: string
          idempotency_key?: string | null
          is_deleted?: boolean | null
          is_opening_balance?: boolean | null
          notes?: string | null
          payment_method?: string | null
          reference?: string | null
          return_id?: string | null
          reversed_by_id?: string | null
          transaction_date?: string
          transaction_type?: string
          updated_at?: string
          user_id: string
          workshop_id?: string | null
        }
        Update: {
          account_id_credit?: string | null
          account_id_debit?: string | null
          amount?: number
          contact_id?: string | null
          cost_center_name?: string | null
          created_at?: string
          credit_account_code?: string
          currency?: string
          debit_account_code?: string
          description?: string
          exchange_rate?: number | null
          expense_category?: string | null
          foreign_amount?: number | null
          id?: string
          idempotency_key?: string | null
          is_deleted?: boolean | null
          is_opening_balance?: boolean | null
          notes?: string | null
          payment_method?: string | null
          reference?: string | null
          return_id?: string | null
          reversed_by_id?: string | null
          transaction_date?: string
          transaction_type?: string
          updated_at?: string
          user_id?: string
          workshop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_reversed_by_id_fkey"
            columns: ["reversed_by_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_reversed_by_id_fkey"
            columns: ["reversed_by_id"]
            isOneToOne: false
            referencedRelation: "v_drift_tx_no_idempotency"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_reversed_by_id_fkey"
            columns: ["reversed_by_id"]
            isOneToOne: false
            referencedRelation: "v_drift_tx_no_reference"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_reversed_by_id_fkey"
            columns: ["reversed_by_id"]
            isOneToOne: false
            referencedRelation: "v_drift_tx_same_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_reversed_by_id_fkey"
            columns: ["reversed_by_id"]
            isOneToOne: false
            referencedRelation: "v_drift_tx_zero_amount"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_booking_documents: {
        Row: {
          booking_id: string | null
          created_at: string | null
          document_type: string | null
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          notes: string | null
          user_id: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string | null
          document_type?: string | null
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          notes?: string | null
          user_id: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string | null
          document_type?: string | null
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "travel_booking_documents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "travel_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_booking_items: {
        Row: {
          booking_id: string | null
          check_in_date: string | null
          check_out_date: string | null
          city: string | null
          created_at: string | null
          currency_id: string | null
          description: string
          exchange_rate: number | null
          id: string
          item_type: string
          nights: number | null
          notes: string | null
          quantity: number | null
          sort_order: number | null
          supplier_contact_id: string | null
          total_cost: number | null
          total_price: number | null
          unit_cost: number | null
          unit_price: number | null
          user_id: string
        }
        Insert: {
          booking_id?: string | null
          check_in_date?: string | null
          check_out_date?: string | null
          city?: string | null
          created_at?: string | null
          currency_id?: string | null
          description?: string
          exchange_rate?: number | null
          id?: string
          item_type?: string
          nights?: number | null
          notes?: string | null
          quantity?: number | null
          sort_order?: number | null
          supplier_contact_id?: string | null
          total_cost?: number | null
          total_price?: number | null
          unit_cost?: number | null
          unit_price?: number | null
          user_id: string
        }
        Update: {
          booking_id?: string | null
          check_in_date?: string | null
          check_out_date?: string | null
          city?: string | null
          created_at?: string | null
          currency_id?: string | null
          description?: string
          exchange_rate?: number | null
          id?: string
          item_type?: string
          nights?: number | null
          notes?: string | null
          quantity?: number | null
          sort_order?: number | null
          supplier_contact_id?: string | null
          total_cost?: number | null
          total_price?: number | null
          unit_cost?: number | null
          unit_price?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "travel_booking_items_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "travel_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_booking_items_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_booking_items_supplier_contact_id_fkey"
            columns: ["supplier_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_booking_passengers: {
        Row: {
          booking_id: string | null
          date_of_birth: string | null
          email: string | null
          full_name: string
          full_name_en: string | null
          gender: string | null
          id: string
          mahram_name: string | null
          national_id: string | null
          nationality: string | null
          notes: string | null
          passenger_index: number | null
          passport_expiry: string | null
          passport_image_url: string | null
          passport_issue_date: string | null
          passport_number: string | null
          phone: string | null
          room_type: string | null
          ticket_number: string | null
          user_id: string | null
        }
        Insert: {
          booking_id?: string | null
          date_of_birth?: string | null
          email?: string | null
          full_name: string
          full_name_en?: string | null
          gender?: string | null
          id?: string
          mahram_name?: string | null
          national_id?: string | null
          nationality?: string | null
          notes?: string | null
          passenger_index?: number | null
          passport_expiry?: string | null
          passport_image_url?: string | null
          passport_issue_date?: string | null
          passport_number?: string | null
          phone?: string | null
          room_type?: string | null
          ticket_number?: string | null
          user_id?: string | null
        }
        Update: {
          booking_id?: string | null
          date_of_birth?: string | null
          email?: string | null
          full_name?: string
          full_name_en?: string | null
          gender?: string | null
          id?: string
          mahram_name?: string | null
          national_id?: string | null
          nationality?: string | null
          notes?: string | null
          passenger_index?: number | null
          passport_expiry?: string | null
          passport_image_url?: string | null
          passport_issue_date?: string | null
          passport_number?: string | null
          phone?: string | null
          room_type?: string | null
          ticket_number?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "travel_booking_passengers_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "travel_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_booking_payments: {
        Row: {
          account_id: string | null
          amount: number
          amount_ils: number | null
          bank_name: string | null
          booking_id: string | null
          cash_box_id: string | null
          created_at: string | null
          currency: string | null
          exchange_rate: number | null
          id: string
          journal_entry_id: string | null
          linked_transaction_id: string | null
          notes: string | null
          payment_date: string | null
          payment_direction: string | null
          payment_method: string | null
          receipt_number: string | null
          received_by: string | null
          reference_number: string | null
          user_id: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          amount_ils?: number | null
          bank_name?: string | null
          booking_id?: string | null
          cash_box_id?: string | null
          created_at?: string | null
          currency?: string | null
          exchange_rate?: number | null
          id?: string
          journal_entry_id?: string | null
          linked_transaction_id?: string | null
          notes?: string | null
          payment_date?: string | null
          payment_direction?: string | null
          payment_method?: string | null
          receipt_number?: string | null
          received_by?: string | null
          reference_number?: string | null
          user_id: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          amount_ils?: number | null
          bank_name?: string | null
          booking_id?: string | null
          cash_box_id?: string | null
          created_at?: string | null
          currency?: string | null
          exchange_rate?: number | null
          id?: string
          journal_entry_id?: string | null
          linked_transaction_id?: string | null
          notes?: string | null
          payment_date?: string | null
          payment_direction?: string | null
          payment_method?: string | null
          receipt_number?: string | null
          received_by?: string | null
          reference_number?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "travel_booking_payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "travel_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_bookings: {
        Row: {
          amount_paid: number | null
          booking_date: string | null
          booking_number: string | null
          cancellation_penalty: number | null
          commission_amount: number | null
          commission_rate: number | null
          commission_type: string | null
          contact_id: string | null
          cost_currency: string | null
          cost_exchange_rate: number | null
          cost_price: number
          cost_price_ils: number | null
          created_at: string | null
          created_by: string | null
          currency_id: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          destination: string | null
          id: string
          internal_notes: string | null
          journal_entry_id: string | null
          linked_transaction_id: string | null
          notes: string | null
          origin: string | null
          pax_count: number | null
          payment_status: string | null
          profit_margin: number | null
          refund_amount: number | null
          return_date: string | null
          selling_currency: string | null
          selling_price: number
          service_type: string
          status: string | null
          supplier_contact_id: string | null
          supplier_id: string | null
          supplier_paid: boolean | null
          supplier_paid_date: string | null
          supplier_ref: string | null
          travel_date: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount_paid?: number | null
          booking_date?: string | null
          booking_number?: string | null
          cancellation_penalty?: number | null
          commission_amount?: number | null
          commission_rate?: number | null
          commission_type?: string | null
          contact_id?: string | null
          cost_currency?: string | null
          cost_exchange_rate?: number | null
          cost_price?: number
          cost_price_ils?: number | null
          created_at?: string | null
          created_by?: string | null
          currency_id?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          destination?: string | null
          id?: string
          internal_notes?: string | null
          journal_entry_id?: string | null
          linked_transaction_id?: string | null
          notes?: string | null
          origin?: string | null
          pax_count?: number | null
          payment_status?: string | null
          profit_margin?: number | null
          refund_amount?: number | null
          return_date?: string | null
          selling_currency?: string | null
          selling_price?: number
          service_type: string
          status?: string | null
          supplier_contact_id?: string | null
          supplier_id?: string | null
          supplier_paid?: boolean | null
          supplier_paid_date?: string | null
          supplier_ref?: string | null
          travel_date?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount_paid?: number | null
          booking_date?: string | null
          booking_number?: string | null
          cancellation_penalty?: number | null
          commission_amount?: number | null
          commission_rate?: number | null
          commission_type?: string | null
          contact_id?: string | null
          cost_currency?: string | null
          cost_exchange_rate?: number | null
          cost_price?: number
          cost_price_ils?: number | null
          created_at?: string | null
          created_by?: string | null
          currency_id?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          destination?: string | null
          id?: string
          internal_notes?: string | null
          journal_entry_id?: string | null
          linked_transaction_id?: string | null
          notes?: string | null
          origin?: string | null
          pax_count?: number | null
          payment_status?: string | null
          profit_margin?: number | null
          refund_amount?: number | null
          return_date?: string | null
          selling_currency?: string | null
          selling_price?: number
          service_type?: string
          status?: string | null
          supplier_contact_id?: string | null
          supplier_id?: string | null
          supplier_paid?: boolean | null
          supplier_paid_date?: string | null
          supplier_ref?: string | null
          travel_date?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "travel_bookings_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_bookings_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_bookings_supplier_contact_id_fkey"
            columns: ["supplier_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_bookings_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "travel_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_currencies: {
        Row: {
          currency_code: string
          currency_name_ar: string
          exchange_rate: number | null
          id: string
          is_default: boolean | null
          symbol: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          currency_code: string
          currency_name_ar: string
          exchange_rate?: number | null
          id?: string
          is_default?: boolean | null
          symbol?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          currency_code?: string
          currency_name_ar?: string
          exchange_rate?: number | null
          id?: string
          is_default?: boolean | null
          symbol?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      travel_packages: {
        Row: {
          cost_per_person: number | null
          created_at: string | null
          description: string | null
          destination: string | null
          duration_nights: number | null
          excludes: string[] | null
          id: string
          image_url: string | null
          includes: string[] | null
          is_active: boolean | null
          max_pax: number | null
          name: string
          selling_price_per_person: number | null
          terms: string | null
          type: string | null
          updated_at: string | null
          user_id: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          cost_per_person?: number | null
          created_at?: string | null
          description?: string | null
          destination?: string | null
          duration_nights?: number | null
          excludes?: string[] | null
          id?: string
          image_url?: string | null
          includes?: string[] | null
          is_active?: boolean | null
          max_pax?: number | null
          name: string
          selling_price_per_person?: number | null
          terms?: string | null
          type?: string | null
          updated_at?: string | null
          user_id: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          cost_per_person?: number | null
          created_at?: string | null
          description?: string | null
          destination?: string | null
          duration_nights?: number | null
          excludes?: string[] | null
          id?: string
          image_url?: string | null
          includes?: string[] | null
          is_active?: boolean | null
          max_pax?: number | null
          name?: string
          selling_price_per_person?: number | null
          terms?: string | null
          type?: string | null
          updated_at?: string | null
          user_id?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: []
      }
      travel_service_types: {
        Row: {
          created_at: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name_ar: string
          name_en: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name_ar: string
          name_en?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name_ar?: string
          name_en?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      travel_supplier_settlements: {
        Row: {
          amount: number
          bank_account_id: string | null
          booking_ids: string[] | null
          created_at: string | null
          currency: string | null
          id: string
          linked_transaction_id: string | null
          notes: string | null
          payment_method: string | null
          reference: string | null
          settlement_date: string | null
          supplier_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          booking_ids?: string[] | null
          created_at?: string | null
          currency?: string | null
          id?: string
          linked_transaction_id?: string | null
          notes?: string | null
          payment_method?: string | null
          reference?: string | null
          settlement_date?: string | null
          supplier_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          booking_ids?: string[] | null
          created_at?: string | null
          currency?: string | null
          id?: string
          linked_transaction_id?: string | null
          notes?: string | null
          payment_method?: string | null
          reference?: string | null
          settlement_date?: string | null
          supplier_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "travel_supplier_settlements_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "travel_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_suppliers: {
        Row: {
          balance: number | null
          commission_rate: number | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          country: string | null
          created_at: string | null
          currency: string | null
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          payment_terms: string | null
          type: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          balance?: number | null
          commission_rate?: number | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          payment_terms?: string | null
          type?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          balance?: number | null
          commission_rate?: number | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          payment_terms?: string | null
          type?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_favorite_apps: {
        Row: {
          app_id: string
          created_at: string
          id: string
          sort_order: number
          user_id: string
        }
        Insert: {
          app_id: string
          created_at?: string
          id?: string
          sort_order?: number
          user_id: string
        }
        Update: {
          app_id?: string
          created_at?: string
          id?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: []
      }
      user_onboarding: {
        Row: {
          created_at: string
          dont_show_again: boolean
          full_tour_completed: boolean
          full_tour_completed_at: string | null
          full_tour_skipped: boolean
          id: string
          last_whats_new_seen: string | null
          module_first_visits: Json
          modules_toured: Json
          updated_at: string
          user_id: string
          welcome_modal_shown: boolean
        }
        Insert: {
          created_at?: string
          dont_show_again?: boolean
          full_tour_completed?: boolean
          full_tour_completed_at?: string | null
          full_tour_skipped?: boolean
          id?: string
          last_whats_new_seen?: string | null
          module_first_visits?: Json
          modules_toured?: Json
          updated_at?: string
          user_id: string
          welcome_modal_shown?: boolean
        }
        Update: {
          created_at?: string
          dont_show_again?: boolean
          full_tour_completed?: boolean
          full_tour_completed_at?: string | null
          full_tour_skipped?: boolean
          id?: string
          last_whats_new_seen?: string | null
          module_first_visits?: Json
          modules_toured?: Json
          updated_at?: string
          user_id?: string
          welcome_modal_shown?: boolean
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_security_audit: {
        Row: {
          auth_method: string | null
          browser: string | null
          city: string | null
          country: string | null
          created_at: string
          device_type: string | null
          event_type: string
          id: string
          ip_address: string | null
          is_new_device: boolean | null
          is_suspicious: boolean | null
          metadata: Json | null
          os: string | null
          risk_score: number | null
          user_agent: string | null
          user_email: string | null
          user_id: string
          user_name: string | null
        }
        Insert: {
          auth_method?: string | null
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          event_type: string
          id?: string
          ip_address?: string | null
          is_new_device?: boolean | null
          is_suspicious?: boolean | null
          metadata?: Json | null
          os?: string | null
          risk_score?: number | null
          user_agent?: string | null
          user_email?: string | null
          user_id: string
          user_name?: string | null
        }
        Update: {
          auth_method?: string | null
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          event_type?: string
          id?: string
          ip_address?: string | null
          is_new_device?: boolean | null
          is_suspicious?: boolean | null
          metadata?: Json | null
          os?: string | null
          risk_score?: number | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      van_sales_days: {
        Row: {
          actual_cash_collected: number | null
          cash_variance: number | null
          closed_at: string | null
          closed_by: string | null
          closing_notes: string | null
          created_at: string
          day_date: string
          day_number: string
          expected_cash: number | null
          id: string
          load_transfer_id: string | null
          opened_at: string
          opened_by: string | null
          opening_cash: number
          opening_currency: string
          opening_notes: string | null
          sales_rep_id: string
          status: string
          stock_variance_items: number | null
          stock_variance_value: number | null
          total_collections: number | null
          total_invoices: number | null
          total_returns: number | null
          total_sales: number | null
          updated_at: string
          user_id: string
          warehouse_id: string
        }
        Insert: {
          actual_cash_collected?: number | null
          cash_variance?: number | null
          closed_at?: string | null
          closed_by?: string | null
          closing_notes?: string | null
          created_at?: string
          day_date?: string
          day_number: string
          expected_cash?: number | null
          id?: string
          load_transfer_id?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_cash?: number
          opening_currency?: string
          opening_notes?: string | null
          sales_rep_id: string
          status?: string
          stock_variance_items?: number | null
          stock_variance_value?: number | null
          total_collections?: number | null
          total_invoices?: number | null
          total_returns?: number | null
          total_sales?: number | null
          updated_at?: string
          user_id: string
          warehouse_id: string
        }
        Update: {
          actual_cash_collected?: number | null
          cash_variance?: number | null
          closed_at?: string | null
          closed_by?: string | null
          closing_notes?: string | null
          created_at?: string
          day_date?: string
          day_number?: string
          expected_cash?: number | null
          id?: string
          load_transfer_id?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_cash?: number
          opening_currency?: string
          opening_notes?: string | null
          sales_rep_id?: string
          status?: string
          stock_variance_items?: number | null
          stock_variance_value?: number | null
          total_collections?: number | null
          total_invoices?: number | null
          total_returns?: number | null
          total_sales?: number | null
          updated_at?: string
          user_id?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "van_sales_days_load_transfer_id_fkey"
            columns: ["load_transfer_id"]
            isOneToOne: false
            referencedRelation: "stock_transfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "van_sales_days_sales_rep_id_fkey"
            columns: ["sales_rep_id"]
            isOneToOne: false
            referencedRelation: "sales_representatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "van_sales_days_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "product_warehouse_stock"
            referencedColumns: ["warehouse_id"]
          },
          {
            foreignKeyName: "van_sales_days_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_lines: {
        Row: {
          account_code: string
          account_name: string | null
          contact_id: string | null
          contact_name: string | null
          created_at: string | null
          credit: number | null
          debit: number | null
          description: string | null
          id: string
          line_comment: string | null
          line_order: number | null
          voucher_id: string
        }
        Insert: {
          account_code: string
          account_name?: string | null
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string | null
          credit?: number | null
          debit?: number | null
          description?: string | null
          id?: string
          line_comment?: string | null
          line_order?: number | null
          voucher_id: string
        }
        Update: {
          account_code?: string
          account_name?: string | null
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string | null
          credit?: number | null
          debit?: number | null
          description?: string | null
          id?: string
          line_comment?: string | null
          line_order?: number | null
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_lines_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      vouchers: {
        Row: {
          amount: number | null
          amount_ils: number | null
          attachments: Json | null
          bank_account_id: string | null
          cheque_bank_name: string | null
          cheque_due_date: string | null
          cheque_number: string | null
          contact_id: string | null
          created_at: string | null
          currency: string | null
          date: string
          description: string
          employee_id: string | null
          exchange_rate: number | null
          id: string
          line_sort_order: string | null
          linked_transaction_id: string | null
          notes: string | null
          payment_method: string | null
          posted_at: string | null
          posted_by: string | null
          ref_number: string
          status: string | null
          subtype: string | null
          type: string
          updated_at: string | null
          user_id: string
          workshop_id: string | null
        }
        Insert: {
          amount?: number | null
          amount_ils?: number | null
          attachments?: Json | null
          bank_account_id?: string | null
          cheque_bank_name?: string | null
          cheque_due_date?: string | null
          cheque_number?: string | null
          contact_id?: string | null
          created_at?: string | null
          currency?: string | null
          date?: string
          description: string
          employee_id?: string | null
          exchange_rate?: number | null
          id?: string
          line_sort_order?: string | null
          linked_transaction_id?: string | null
          notes?: string | null
          payment_method?: string | null
          posted_at?: string | null
          posted_by?: string | null
          ref_number: string
          status?: string | null
          subtype?: string | null
          type: string
          updated_at?: string | null
          user_id: string
          workshop_id?: string | null
        }
        Update: {
          amount?: number | null
          amount_ils?: number | null
          attachments?: Json | null
          bank_account_id?: string | null
          cheque_bank_name?: string | null
          cheque_due_date?: string | null
          cheque_number?: string | null
          contact_id?: string | null
          created_at?: string | null
          currency?: string | null
          date?: string
          description?: string
          employee_id?: string | null
          exchange_rate?: number | null
          id?: string
          line_sort_order?: string | null
          linked_transaction_id?: string | null
          notes?: string | null
          payment_method?: string | null
          posted_at?: string | null
          posted_by?: string | null
          ref_number?: string
          status?: string | null
          subtype?: string | null
          type?: string
          updated_at?: string | null
          user_id?: string
          workshop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          address: string | null
          branch_id: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          manager_employee_id: string | null
          name: string
          notes: string | null
          sales_rep_id: string | null
          updated_at: string
          user_id: string
          warehouse_type: string
        }
        Insert: {
          address?: string | null
          branch_id?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          manager_employee_id?: string | null
          name: string
          notes?: string | null
          sales_rep_id?: string | null
          updated_at?: string
          user_id: string
          warehouse_type?: string
        }
        Update: {
          address?: string | null
          branch_id?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          manager_employee_id?: string | null
          name?: string
          notes?: string | null
          sales_rep_id?: string | null
          updated_at?: string
          user_id?: string
          warehouse_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouses_manager_employee_id_fkey"
            columns: ["manager_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouses_manager_employee_id_fkey"
            columns: ["manager_employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouses_sales_rep_id_fkey"
            columns: ["sales_rep_id"]
            isOneToOne: false
            referencedRelation: "sales_representatives"
            referencedColumns: ["id"]
          },
        ]
      }
      warranty_cards: {
        Row: {
          card_number: string
          contact_id: string | null
          contact_name: string | null
          created_at: string
          duration_months: number
          end_date: string
          id: string
          invoice_id: string | null
          invoice_item_id: string | null
          notes: string | null
          policy_id: string | null
          product_id: string
          quantity: number
          serial_number: string | null
          start_date: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          card_number: string
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string
          duration_months?: number
          end_date: string
          id?: string
          invoice_id?: string | null
          invoice_item_id?: string | null
          notes?: string | null
          policy_id?: string | null
          product_id: string
          quantity?: number
          serial_number?: string | null
          start_date?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          card_number?: string
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string
          duration_months?: number
          end_date?: string
          id?: string
          invoice_id?: string | null
          invoice_item_id?: string | null
          notes?: string | null
          policy_id?: string | null
          product_id?: string
          quantity?: number
          serial_number?: string | null
          start_date?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warranty_cards_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_cards_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_cards_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_drift_invoice_no_link"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_cards_invoice_item_id_fkey"
            columns: ["invoice_item_id"]
            isOneToOne: false
            referencedRelation: "invoice_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_cards_invoice_item_id_fkey"
            columns: ["invoice_item_id"]
            isOneToOne: false
            referencedRelation: "invoice_items_returnable"
            referencedColumns: ["invoice_item_id"]
          },
          {
            foreignKeyName: "warranty_cards_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "warranty_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_cards_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_warehouse_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "warranty_cards_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      warranty_claims: {
        Row: {
          attachments: Json | null
          claim_date: string
          claim_number: string
          claim_type: string
          cost: number
          created_at: string
          id: string
          issue_description: string
          replacement_invoice_id: string | null
          resolution: string | null
          resolution_date: string | null
          resolution_notes: string | null
          status: string
          supplier_claim_id: string | null
          transaction_id: string | null
          updated_at: string
          user_id: string
          warranty_card_id: string
        }
        Insert: {
          attachments?: Json | null
          claim_date?: string
          claim_number: string
          claim_type?: string
          cost?: number
          created_at?: string
          id?: string
          issue_description: string
          replacement_invoice_id?: string | null
          resolution?: string | null
          resolution_date?: string | null
          resolution_notes?: string | null
          status?: string
          supplier_claim_id?: string | null
          transaction_id?: string | null
          updated_at?: string
          user_id: string
          warranty_card_id: string
        }
        Update: {
          attachments?: Json | null
          claim_date?: string
          claim_number?: string
          claim_type?: string
          cost?: number
          created_at?: string
          id?: string
          issue_description?: string
          replacement_invoice_id?: string | null
          resolution?: string | null
          resolution_date?: string | null
          resolution_notes?: string | null
          status?: string
          supplier_claim_id?: string | null
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
          warranty_card_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warranty_claims_replacement_invoice_id_fkey"
            columns: ["replacement_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_claims_replacement_invoice_id_fkey"
            columns: ["replacement_invoice_id"]
            isOneToOne: false
            referencedRelation: "v_drift_invoice_no_link"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_claims_supplier_claim_id_fkey"
            columns: ["supplier_claim_id"]
            isOneToOne: false
            referencedRelation: "warranty_supplier_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_claims_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_claims_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_drift_tx_no_idempotency"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_claims_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_drift_tx_no_reference"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_claims_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_drift_tx_same_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_claims_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_drift_tx_zero_amount"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_claims_warranty_card_id_fkey"
            columns: ["warranty_card_id"]
            isOneToOne: false
            referencedRelation: "warranty_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      warranty_policies: {
        Row: {
          created_at: string
          duration_months: number
          has_serial: boolean
          id: string
          is_active: boolean
          product_id: string
          supplier_covers: number
          supplier_id: string | null
          terms: string | null
          updated_at: string
          user_id: string
          warranty_type: string
        }
        Insert: {
          created_at?: string
          duration_months?: number
          has_serial?: boolean
          id?: string
          is_active?: boolean
          product_id: string
          supplier_covers?: number
          supplier_id?: string | null
          terms?: string | null
          updated_at?: string
          user_id: string
          warranty_type?: string
        }
        Update: {
          created_at?: string
          duration_months?: number
          has_serial?: boolean
          id?: string
          is_active?: boolean
          product_id?: string
          supplier_covers?: number
          supplier_id?: string | null
          terms?: string | null
          updated_at?: string
          user_id?: string
          warranty_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "warranty_policies_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_warehouse_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "warranty_policies_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_policies_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      warranty_supplier_claims: {
        Row: {
          claim_date: string
          claim_number: string
          created_at: string
          id: string
          notes: string | null
          our_cost: number
          resolution_date: string | null
          status: string
          supplier_coverage_amount: number
          supplier_id: string
          supplier_name: string | null
          total_cost: number
          transaction_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          claim_date?: string
          claim_number: string
          created_at?: string
          id?: string
          notes?: string | null
          our_cost?: number
          resolution_date?: string | null
          status?: string
          supplier_coverage_amount?: number
          supplier_id: string
          supplier_name?: string | null
          total_cost?: number
          transaction_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          claim_date?: string
          claim_number?: string
          created_at?: string
          id?: string
          notes?: string | null
          our_cost?: number
          resolution_date?: string | null
          status?: string
          supplier_coverage_amount?: number
          supplier_id?: string
          supplier_name?: string | null
          total_cost?: number
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warranty_supplier_claims_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_supplier_claims_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_supplier_claims_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_drift_tx_no_idempotency"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_supplier_claims_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_drift_tx_no_reference"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_supplier_claims_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_drift_tx_same_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_supplier_claims_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_drift_tx_zero_amount"
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
      webhook_logs: {
        Row: {
          created_at: string | null
          direction: string
          duration_ms: number | null
          endpoint: string | null
          error_message: string | null
          event_type: string
          id: string
          order_id: string | null
          order_reference: string | null
          payload: Json | null
          response_body: string | null
          response_status: number | null
          success: boolean | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          direction?: string
          duration_ms?: number | null
          endpoint?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          order_id?: string | null
          order_reference?: string | null
          payload?: Json | null
          response_body?: string | null
          response_status?: number | null
          success?: boolean | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          direction?: string
          duration_ms?: number | null
          endpoint?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          order_id?: string | null
          order_reference?: string | null
          payload?: Json | null
          response_body?: string | null
          response_status?: number | null
          success?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      work_shifts: {
        Row: {
          break_duration_minutes: number | null
          created_at: string | null
          crosses_midnight: boolean
          days_of_week: number[] | null
          end_time: string
          id: string
          is_active: boolean | null
          late_tolerance_minutes: number | null
          name: string
          overtime_after_minutes: number | null
          start_time: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          break_duration_minutes?: number | null
          created_at?: string | null
          crosses_midnight?: boolean
          days_of_week?: number[] | null
          end_time?: string
          id?: string
          is_active?: boolean | null
          late_tolerance_minutes?: number | null
          name: string
          overtime_after_minutes?: number | null
          start_time?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          break_duration_minutes?: number | null
          created_at?: string | null
          crosses_midnight?: boolean
          days_of_week?: number[] | null
          end_time?: string
          id?: string
          is_active?: boolean | null
          late_tolerance_minutes?: number | null
          name?: string
          overtime_after_minutes?: number | null
          start_time?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      workshop_costs: {
        Row: {
          amount: number
          category: string | null
          cost_date: string | null
          cost_type: string
          created_at: string | null
          description: string | null
          id: string
          invoice_number: string | null
          linked_transaction_id: string | null
          notes: string | null
          payment_method: string | null
          phase: string | null
          quantity: number | null
          receipt_image_url: string | null
          receipt_url: string | null
          supplier_contact_id: string | null
          supplier_name: string | null
          unit: string | null
          unit_price: number | null
          user_id: string
          waste_amount: number | null
          waste_percentage: number | null
          workshop_id: string
        }
        Insert: {
          amount?: number
          category?: string | null
          cost_date?: string | null
          cost_type: string
          created_at?: string | null
          description?: string | null
          id?: string
          invoice_number?: string | null
          linked_transaction_id?: string | null
          notes?: string | null
          payment_method?: string | null
          phase?: string | null
          quantity?: number | null
          receipt_image_url?: string | null
          receipt_url?: string | null
          supplier_contact_id?: string | null
          supplier_name?: string | null
          unit?: string | null
          unit_price?: number | null
          user_id: string
          waste_amount?: number | null
          waste_percentage?: number | null
          workshop_id: string
        }
        Update: {
          amount?: number
          category?: string | null
          cost_date?: string | null
          cost_type?: string
          created_at?: string | null
          description?: string | null
          id?: string
          invoice_number?: string | null
          linked_transaction_id?: string | null
          notes?: string | null
          payment_method?: string | null
          phase?: string | null
          quantity?: number | null
          receipt_image_url?: string | null
          receipt_url?: string | null
          supplier_contact_id?: string | null
          supplier_name?: string | null
          unit?: string | null
          unit_price?: number | null
          user_id?: string
          waste_amount?: number | null
          waste_percentage?: number | null
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workshop_costs_supplier_contact_id_fkey"
            columns: ["supplier_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workshop_costs_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      workshop_material_inventory: {
        Row: {
          created_at: string | null
          id: string
          material_category: string | null
          material_type: string
          notes: string | null
          quantity: number
          source_cost_id: string | null
          source_workshop_id: string | null
          status: string
          supplier_contact_id: string | null
          supplier_name: string | null
          target_workshop_id: string | null
          total_value: number
          unit: string
          unit_cost: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          material_category?: string | null
          material_type: string
          notes?: string | null
          quantity?: number
          source_cost_id?: string | null
          source_workshop_id?: string | null
          status?: string
          supplier_contact_id?: string | null
          supplier_name?: string | null
          target_workshop_id?: string | null
          total_value?: number
          unit?: string
          unit_cost?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          material_category?: string | null
          material_type?: string
          notes?: string | null
          quantity?: number
          source_cost_id?: string | null
          source_workshop_id?: string | null
          status?: string
          supplier_contact_id?: string | null
          supplier_name?: string | null
          target_workshop_id?: string | null
          total_value?: number
          unit?: string
          unit_cost?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workshop_material_inventory_source_workshop_id_fkey"
            columns: ["source_workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workshop_material_inventory_supplier_contact_id_fkey"
            columns: ["supplier_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workshop_material_inventory_target_workshop_id_fkey"
            columns: ["target_workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      workshop_payments: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          linked_transaction_id: string | null
          payment_date: string
          payment_method: string
          user_id: string
          workshop_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          linked_transaction_id?: string | null
          payment_date?: string
          payment_method?: string
          user_id: string
          workshop_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          linked_transaction_id?: string | null
          payment_date?: string
          payment_method?: string
          user_id?: string
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workshop_payments_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      workshops: {
        Row: {
          actual_end_date: string | null
          address: string | null
          area_sqm: number | null
          contact_id: string | null
          created_at: string | null
          customer_name: string | null
          customer_phone: string | null
          description: string | null
          expected_end_date: string | null
          id: string
          image_url: string | null
          name: string
          notes: string | null
          start_date: string | null
          status: string
          total_budget: number | null
          updated_at: string | null
          user_id: string
          workshop_type: string | null
        }
        Insert: {
          actual_end_date?: string | null
          address?: string | null
          area_sqm?: number | null
          contact_id?: string | null
          created_at?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          description?: string | null
          expected_end_date?: string | null
          id?: string
          image_url?: string | null
          name: string
          notes?: string | null
          start_date?: string | null
          status?: string
          total_budget?: number | null
          updated_at?: string | null
          user_id: string
          workshop_type?: string | null
        }
        Update: {
          actual_end_date?: string | null
          address?: string | null
          area_sqm?: number | null
          contact_id?: string | null
          created_at?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          description?: string | null
          expected_end_date?: string | null
          id?: string
          image_url?: string | null
          name?: string
          notes?: string | null
          start_date?: string | null
          status?: string
          total_budget?: number | null
          updated_at?: string | null
          user_id?: string
          workshop_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workshops_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      branches_safe: {
        Row: {
          address: string | null
          created_at: string | null
          id: string | null
          is_active: boolean | null
          latitude: number | null
          longitude: number | null
          name: string | null
          qr_rotation_minutes: number | null
          radius_meters: number | null
          require_gps: boolean | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          qr_rotation_minutes?: number | null
          radius_meters?: number | null
          require_gps?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          qr_rotation_minutes?: number | null
          radius_meters?: number | null
          require_gps?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      employees_safe: {
        Row: {
          address: string | null
          annual_leave_days: number | null
          auth_user_id: string | null
          bank_account: string | null
          bank_name: string | null
          base_salary: number | null
          branch_id: string | null
          created_at: string | null
          department: string | null
          email: string | null
          emergency_contact: string | null
          emergency_phone: string | null
          end_date: string | null
          full_name: string | null
          hourly_rate: number | null
          id: string | null
          id_number: string | null
          is_active: boolean | null
          job_title: string | null
          notes: string | null
          phone: string | null
          photo_url: string | null
          position: string | null
          salary_type: string | null
          sick_leave_days: number | null
          start_date: string | null
          updated_at: string | null
          user_id: string | null
          work_days_per_week: number | null
          work_hours_per_day: number | null
        }
        Insert: {
          address?: never
          annual_leave_days?: number | null
          auth_user_id?: string | null
          bank_account?: never
          bank_name?: never
          base_salary?: never
          branch_id?: string | null
          created_at?: string | null
          department?: string | null
          email?: string | null
          emergency_contact?: never
          emergency_phone?: never
          end_date?: string | null
          full_name?: string | null
          hourly_rate?: never
          id?: string | null
          id_number?: never
          is_active?: boolean | null
          job_title?: string | null
          notes?: never
          phone?: string | null
          photo_url?: string | null
          position?: string | null
          salary_type?: string | null
          sick_leave_days?: number | null
          start_date?: string | null
          updated_at?: string | null
          user_id?: string | null
          work_days_per_week?: number | null
          work_hours_per_day?: number | null
        }
        Update: {
          address?: never
          annual_leave_days?: number | null
          auth_user_id?: string | null
          bank_account?: never
          bank_name?: never
          base_salary?: never
          branch_id?: string | null
          created_at?: string | null
          department?: string | null
          email?: string | null
          emergency_contact?: never
          emergency_phone?: never
          end_date?: string | null
          full_name?: string | null
          hourly_rate?: never
          id?: string | null
          id_number?: never
          is_active?: boolean | null
          job_title?: string | null
          notes?: never
          phone?: string | null
          photo_url?: string | null
          position?: string | null
          salary_type?: string | null
          sick_leave_days?: number | null
          start_date?: string | null
          updated_at?: string | null
          user_id?: string | null
          work_days_per_week?: number | null
          work_hours_per_day?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items_returnable: {
        Row: {
          description: string | null
          invoice_id: string | null
          invoice_item_id: string | null
          invoice_type: string | null
          original_quantity: number | null
          product_id: string | null
          remaining_returnable_quantity: number | null
          returned_quantity: number | null
          tax_rate: number | null
          unit_price: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_drift_invoice_no_link"
            referencedColumns: ["id"]
          },
        ]
      }
      product_warehouse_stock: {
        Row: {
          last_movement_at: string | null
          movement_count: number | null
          product_id: string | null
          product_name: string | null
          quantity_on_hand: number | null
          sales_rep_id: string | null
          unit: string | null
          user_id: string | null
          warehouse_id: string | null
          warehouse_name: string | null
          warehouse_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_sales_rep_id_fkey"
            columns: ["sales_rep_id"]
            isOneToOne: false
            referencedRelation: "sales_representatives"
            referencedColumns: ["id"]
          },
        ]
      }
      v_drift_cheque_no_voucher: {
        Row: {
          amount: number | null
          cheque_date: string | null
          cheque_number: string | null
          cheque_type: Database["public"]["Enums"]["cheque_type"] | null
          created_at: string | null
          id: string | null
          status: Database["public"]["Enums"]["cheque_status"] | null
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          cheque_date?: string | null
          cheque_number?: string | null
          cheque_type?: Database["public"]["Enums"]["cheque_type"] | null
          created_at?: string | null
          id?: string | null
          status?: Database["public"]["Enums"]["cheque_status"] | null
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          cheque_date?: string | null
          cheque_number?: string | null
          cheque_type?: Database["public"]["Enums"]["cheque_type"] | null
          created_at?: string | null
          id?: string | null
          status?: Database["public"]["Enums"]["cheque_status"] | null
          user_id?: string | null
        }
        Relationships: []
      }
      v_drift_invoice_no_link: {
        Row: {
          created_at: string | null
          id: string | null
          invoice_date: string | null
          invoice_number: string | null
          status: string | null
          total_amount: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          invoice_date?: string | null
          invoice_number?: string | null
          status?: string | null
          total_amount?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          invoice_date?: string | null
          invoice_number?: string | null
          status?: string | null
          total_amount?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      v_drift_tax_ledger_dup: {
        Row: {
          dup_count: number | null
          reference_id: string | null
          reference_type: string | null
        }
        Relationships: []
      }
      v_drift_tx_no_idempotency: {
        Row: {
          amount: number | null
          created_at: string | null
          id: string | null
          reference: string | null
          transaction_date: string | null
          transaction_type: string | null
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          id?: string | null
          reference?: string | null
          transaction_date?: string | null
          transaction_type?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          id?: string | null
          reference?: string | null
          transaction_date?: string | null
          transaction_type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      v_drift_tx_no_reference: {
        Row: {
          amount: number | null
          created_at: string | null
          id: string | null
          transaction_date: string | null
          transaction_type: string | null
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          id?: string | null
          transaction_date?: string | null
          transaction_type?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          id?: string | null
          transaction_date?: string | null
          transaction_type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      v_drift_tx_same_account: {
        Row: {
          amount: number | null
          created_at: string | null
          credit_account_code: string | null
          debit_account_code: string | null
          id: string | null
          transaction_date: string | null
          transaction_type: string | null
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          credit_account_code?: string | null
          debit_account_code?: string | null
          id?: string | null
          transaction_date?: string | null
          transaction_type?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          credit_account_code?: string | null
          debit_account_code?: string | null
          id?: string | null
          transaction_date?: string | null
          transaction_type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      v_drift_tx_zero_amount: {
        Row: {
          created_at: string | null
          id: string | null
          reference: string | null
          transaction_date: string | null
          transaction_type: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          reference?: string | null
          transaction_date?: string | null
          transaction_type?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          reference?: string | null
          transaction_date?: string | null
          transaction_type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      v_financial_drift_summary: {
        Row: {
          cnt: number | null
          metric: string | null
        }
        Relationships: []
      }
      v_sales_by_supplier: {
        Row: {
          first_sale: string | null
          last_sale: string | null
          lines_count: number | null
          product_id: string | null
          product_name: string | null
          supplier_id: string | null
          supplier_name: string | null
          total_cost: number | null
          total_profit: number | null
          total_qty: number | null
          total_sales: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _fc_validate_postable_account: {
        Args: { p_account_code: string; p_user_id: string }
        Returns: undefined
      }
      _payroll_post_payment:
        | {
            Args: {
              _bank_account_id: string
              _cheque_due_date: string
              _cheque_number: string
              _payer: string
              _payment_date: string
              _payment_method: string
              _payroll_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              _bank_account_id: string
              _cheque_due_date: string
              _cheque_number: string
              _payer: string
              _payment_account_code?: string
              _payment_date: string
              _payment_method: string
              _payroll_id: string
            }
            Returns: Json
          }
      _pos_sync_stock_movements: {
        Args: { p_is_return: boolean; p_order_id: string; p_user_id: string }
        Returns: undefined
      }
      _pos_vat_output_account: { Args: { p_user_id: string }; Returns: string }
      allocate_voucher_to_invoices_atomic: {
        Args: {
          p_allocations: Json
          p_allow_overpay?: boolean
          p_payment_id: string
          p_transaction_id: string
          p_user_id: string
          p_voucher_amount: number
        }
        Returns: Json
      }
      approve_procurement_request: {
        Args: { p_approved_by: string; p_request_id: string }
        Returns: Json
      }
      cancel_cheque_endorsement: {
        Args: { p_cheque_id: string; p_reason: string; p_user_id: string }
        Returns: Json
      }
      cancel_stock_transfer: {
        Args: { p_reason?: string; p_transfer_id: string }
        Returns: Json
      }
      cleanup_expired_webauthn_challenges: { Args: never; Returns: undefined }
      clear_must_change_password: { Args: never; Returns: boolean }
      close_van_day: {
        Args: {
          p_actual_cash?: number
          p_closing_notes?: string
          p_day_id: string
        }
        Returns: Json
      }
      complete_pos_order: {
        Args: { p_order_id: string; p_payments: Json; p_user_id: string }
        Returns: Json
      }
      confirm_stock_transfer: { Args: { p_transfer_id: string }; Returns: Json }
      create_bank_deposit_atomic: {
        Args: {
          p_amount: number
          p_bank_account_code: string
          p_cash_account_code: string
          p_currency?: string
          p_deposit_date?: string
          p_description?: string
          p_idempotency_key?: string
          p_user_id: string
        }
        Returns: Json
      }
      create_cash_transfer_atomic: {
        Args: {
          p_amount: number
          p_currency?: string
          p_description?: string
          p_from_account_code: string
          p_idempotency_key?: string
          p_source?: string
          p_to_account_code: string
          p_transfer_date?: string
          p_user_id: string
        }
        Returns: Json
      }
      create_cheque_bounce_atomic: {
        Args: {
          p_bank_fees?: number
          p_bounce_date: string
          p_bounce_reason: string
          p_cheque_id: string
          p_outbound?: boolean
          p_user_id: string
        }
        Returns: Json
      }
      create_cheque_lifecycle_event: {
        Args: {
          p_bank_account_code?: string
          p_bank_fees?: number
          p_bank_fees_account_code?: string
          p_cheque_id: string
          p_endorsed_to_contact_id?: string
          p_event: string
          p_event_date?: string
          p_idempotency_key?: string
          p_notes?: string
          p_reason?: string
          p_user_id: string
        }
        Returns: Json
      }
      create_credit_note_atomic: {
        Args: {
          p_amount: number
          p_contact_id: string
          p_contact_name: string
          p_currency?: string
          p_description?: string
          p_idempotency_key?: string
          p_kind?: string
          p_note_date?: string
          p_original_invoice_id: string
          p_user_id: string
        }
        Returns: Json
      }
      create_currency_exchange_atomic: {
        Args: {
          p_description?: string
          p_exchange_date?: string
          p_exchange_rate: number
          p_from_account_code: string
          p_from_amount: number
          p_from_currency: string
          p_gain_loss_account_code?: string
          p_idempotency_key?: string
          p_to_account_code: string
          p_to_amount: number
          p_to_currency: string
          p_user_id: string
        }
        Returns: Json
      }
      create_customer_from_rep: {
        Args: {
          p_address?: string
          p_credit_limit?: number
          p_name: string
          p_notes?: string
          p_payment_terms_days?: number
          p_phone: string
        }
        Returns: {
          address: string | null
          archived_at: string | null
          archived_by: string | null
          avg_payment_days: number | null
          company_size: string | null
          contact_class: string | null
          contact_name: string
          contact_segment: string | null
          contact_type: string
          created_at: string
          created_from_order: boolean | null
          credit_limit: number | null
          current_balance: number | null
          early_pay_discount: number | null
          email: string | null
          id: string
          industry: string | null
          is_active: boolean | null
          is_archived: boolean | null
          last_transaction_date: string | null
          linked_account_code: string | null
          notes: string | null
          overdue_amount: number | null
          payment_terms_days: number | null
          phone: string | null
          purchase_limit: number | null
          sales_rep_id: string | null
          source: string | null
          tax_number: string | null
          total_paid: number | null
          total_purchases: number | null
          total_sales: number | null
          updated_at: string
          user_id: string
          website: string | null
        }
        SetofOptions: {
          from: "*"
          to: "contacts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_invoice_with_entry:
        | {
            Args: {
              p_amount: number
              p_contact_id: string
              p_contact_name: string
              p_currency?: string
              p_description: string
              p_idempotency_key?: string
              p_items?: Json
              p_payment_method?: string
              p_user_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_amount: number
              p_contact_id: string
              p_contact_name: string
              p_cost_center_name?: string
              p_currency?: string
              p_description: string
              p_exchange_rate?: number
              p_foreign_amount?: number
              p_idempotency_key?: string
              p_invoice_type?: string
              p_items?: Json
              p_payment_method?: string
              p_reference?: string
              p_transaction_date?: string
              p_user_id: string
              p_workshop_id?: string
            }
            Returns: Json
          }
      create_journal_entry_atomic: {
        Args: {
          p_currency?: string
          p_description: string
          p_entry_date: string
          p_idempotency_key?: string
          p_lines: Json
          p_reference?: string
          p_source?: string
          p_user_id: string
        }
        Returns: Json
      }
      create_journal_entry_multi_party_atomic: {
        Args: {
          p_currency?: string
          p_description: string
          p_entry_date: string
          p_exchange_rate?: number
          p_idempotency_key?: string
          p_lines: Json
          p_notes?: string
          p_reference?: string
          p_source?: string
          p_user_id: string
        }
        Returns: Json
      }
      create_opening_balance_entry: {
        Args: {
          p_amount: number
          p_balance_date?: string
          p_contact_id?: string
          p_credit_account_code: string
          p_currency?: string
          p_debit_account_code: string
          p_description?: string
          p_idempotency_key?: string
          p_reference?: string
          p_replace_existing?: boolean
          p_user_id: string
        }
        Returns: Json
      }
      create_payment_with_entry: {
        Args: {
          p_allocations?: Json
          p_amount: number
          p_cash_account_code?: string
          p_contact_account_code?: string
          p_contact_id: string
          p_contact_name: string
          p_currency?: string
          p_description?: string
          p_employee_id?: string
          p_exchange_rate?: number
          p_idempotency_key?: string
          p_notes?: string
          p_payment_method?: string
          p_reference?: string
          p_user_id: string
          p_voucher_date?: string
          p_workshop_id?: string
        }
        Returns: Json
      }
      create_purchase_with_entry: {
        Args: {
          p_amount: number
          p_contact_id: string
          p_contact_name: string
          p_currency?: string
          p_description: string
          p_idempotency_key?: string
          p_payment_method?: string
          p_user_id: string
        }
        Returns: Json
      }
      create_receipt_with_entry: {
        Args: {
          p_allocations?: Json
          p_amount: number
          p_cash_account_code?: string
          p_contact_account_code?: string
          p_contact_id: string
          p_contact_name: string
          p_currency?: string
          p_description?: string
          p_employee_id?: string
          p_exchange_rate?: number
          p_idempotency_key?: string
          p_notes?: string
          p_payment_method?: string
          p_reference?: string
          p_user_id: string
          p_voucher_date?: string
          p_workshop_id?: string
        }
        Returns: Json
      }
      create_rep_sale_atomic:
        | {
            Args: {
              p_contact_id: string
              p_contact_name: string
              p_idempotency_key: string
              p_invoice_number: string
              p_items: Json
              p_payment_method: string
              p_sales_rep_id: string
              p_user_id: string
              p_warehouse_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_contact_id: string
              p_contact_name: string
              p_idempotency_key: string
              p_invoice_number?: string
              p_items: Json
              p_payment_method: string
              p_sales_rep_id: string
              p_user_id: string
              p_van_day_id: string
              p_warehouse_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_contact_id: string
              p_contact_name: string
              p_discount_type?: string
              p_discount_value?: number
              p_idempotency_key: string
              p_invoice_number?: string
              p_items: Json
              p_payment_method: string
              p_sales_rep_id: string
              p_user_id: string
              p_van_day_id: string
              p_warehouse_id: string
            }
            Returns: Json
          }
      create_return_with_entry: {
        Args: {
          p_amount: number
          p_contact_id: string
          p_currency?: string
          p_description?: string
          p_idempotency_key?: string
          p_kind: string
          p_reference?: string
          p_return_date?: string
          p_user_id: string
        }
        Returns: Json
      }
      create_reverse_entry: {
        Args: {
          original_transaction_id: string
          reason: string
          reversed_by: string
        }
        Returns: string
      }
      create_sale_invoice_atomic: {
        Args: {
          p_contact_id: string
          p_contact_name: string
          p_currency: string
          p_discount_amount: number
          p_exchange_rate: number
          p_idempotency_key: string
          p_invoice_date: string
          p_items: Json
          p_notes: string
          p_paid_amount: number
          p_payment_method: string
          p_source?: string
          p_subtotal: number
          p_tax_amount: number
          p_total_amount: number
          p_user_id: string
        }
        Returns: Json
      }
      create_task_user: {
        Args: {
          p_avatar_color?: string
          p_full_name: string
          p_password: string
          p_role?: string
          p_user_id: string
          p_username: string
        }
        Returns: Json
      }
      decrement_stock_safe: {
        Args: {
          p_product_id: string
          p_qty: number
          p_reference: string
          p_source: string
          p_user_id: string
        }
        Returns: Json
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      ensure_advance_accounts: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      ensure_default_warehouse: { Args: { p_user_id: string }; Returns: string }
      ensure_party_transfer_clearing_account: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      ensure_return_accounts: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      ensure_travel_accounts: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      ensure_warranty_accounts: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      ensure_work_week_config: {
        Args: { p_user_id: string }
        Returns: {
          created_at: string
          id: string
          notes: string | null
          updated_at: string
          user_id: string
          weekly_off_days: number[]
          work_hours_per_day: number
          working_days: number[]
        }
        SetofOptions: {
          from: "*"
          to: "hr_work_week_config"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      expire_trials: { Args: never; Returns: Json }
      generate_return_number: {
        Args: {
          _return_type: Database["public"]["Enums"]["return_type_enum"]
          _user_id: string
        }
        Returns: string
      }
      get_accounting_center_snapshot: { Args: never; Returns: Json }
      get_cash_box_balance: { Args: { p_box_id: string }; Returns: number }
      get_contact_balance: {
        Args: {
          p_as_of_date?: string
          p_contact_id: string
          p_currency?: string
        }
        Returns: Json
      }
      get_day_type_for_date: {
        Args: { p_date: string; p_user_id: string }
        Returns: string
      }
      get_employee_id_for_user: { Args: { _user: string }; Returns: string }
      get_exchange_rate: {
        Args: { p_currency_code: string; p_date?: string; p_rate_type?: string }
        Returns: number
      }
      get_rep_owner_id: { Args: never; Returns: string }
      get_rep_suppliers: {
        Args: never
        Returns: {
          id: string
          name: string
        }[]
      }
      get_rep_warehouse_id: { Args: never; Returns: string }
      get_team_owner_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_attendance_day_locked: {
        Args: { _branch?: string; _date: string; _owner: string }
        Returns: boolean
      }
      is_branch_manager_of: {
        Args: { _branch: string; _user: string }
        Returns: boolean
      }
      is_company_hr_admin: {
        Args: { _company: string; _user: string }
        Returns: boolean
      }
      is_managed_branch_employee: {
        Args: { _employee_id: string }
        Returns: boolean
      }
      is_manager_of_employee: {
        Args: { _perm?: string; _target_employee_id: string }
        Returns: boolean
      }
      is_module_enabled: {
        Args: { _module: string; _user_id: string }
        Returns: boolean
      }
      is_my_team_employee: { Args: { _employee_id: string }; Returns: boolean }
      is_sales_rep: { Args: never; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_team_member: {
        Args: { _data_owner_id: string; _user_id: string }
        Returns: boolean
      }
      log_sensitive_access: {
        Args: {
          _action: string
          _details?: Json
          _record_id?: string
          _table_name: string
          _user_id: string
        }
        Returns: undefined
      }
      malaki_create_user: {
        Args: {
          p_can_see_all_branches?: boolean
          p_can_see_liquidity?: boolean
          p_can_see_sales?: boolean
          p_full_name: string
          p_password: string
          p_role?: string
          p_user_id?: string
          p_username: string
        }
        Returns: Json
      }
      malaki_set_password: {
        Args: { p_new_password: string; p_user_id: string }
        Returns: boolean
      }
      move_account: {
        Args: {
          p_account_id: string
          p_new_parent_code: string
          p_user_id: string
        }
        Returns: Json
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      next_doc_number: {
        Args: { p_doc_type: string; p_user_id: string; p_year: number }
        Returns: number
      }
      open_van_day: {
        Args: {
          p_load_transfer_id?: string
          p_notes?: string
          p_opening_cash?: number
          p_opening_currency?: string
          p_sales_rep_id: string
        }
        Returns: string
      }
      payroll_approve_batch: {
        Args: {
          _approver: string
          _month: number
          _user_id: string
          _year: number
        }
        Returns: Json
      }
      payroll_approve_employee: {
        Args: { _approver: string; _payroll_id: string }
        Returns: Json
      }
      payroll_pay_batch:
        | {
            Args: {
              _bank_account_id?: string
              _cheque_due_date?: string
              _cheque_number?: string
              _month: number
              _payer: string
              _payment_date?: string
              _payment_method: string
              _user_id: string
              _year: number
            }
            Returns: Json
          }
        | {
            Args: {
              _bank_account_id?: string
              _cheque_due_date?: string
              _cheque_number?: string
              _month: number
              _payer: string
              _payment_account_code?: string
              _payment_date?: string
              _payment_method: string
              _user_id: string
              _year: number
            }
            Returns: Json
          }
      payroll_pay_employee:
        | {
            Args: {
              _bank_account_id?: string
              _cheque_due_date?: string
              _cheque_number?: string
              _payer: string
              _payment_date?: string
              _payment_method: string
              _payroll_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              _bank_account_id?: string
              _cheque_due_date?: string
              _cheque_number?: string
              _payer: string
              _payment_account_code?: string
              _payment_date?: string
              _payment_method: string
              _payroll_id: string
            }
            Returns: Json
          }
      payroll_reject_employee: {
        Args: { _approver: string; _payroll_id: string; _reason: string }
        Returns: Json
      }
      payroll_submit_employee: {
        Args: { _payload: Json; _submitter: string }
        Returns: Json
      }
      post_import_shipment_atomic: {
        Args: { p_shipment_id: string; p_user_id: string }
        Returns: Json
      }
      process_pos_return: {
        Args: {
          p_items: Json
          p_original_order_id: string
          p_payment_method?: string
          p_reason?: string
          p_return_currency?: string
          p_return_exchange_rate?: number
          p_session_id: string
          p_user_id: string
        }
        Returns: Json
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      recalc_invoice_payment_status: {
        Args: { p_invoice_id: string }
        Returns: Json
      }
      recreate_invoice_transaction: {
        Args: { p_invoice_id: string }
        Returns: string
      }
      reject_procurement_request: {
        Args: { p_reason?: string; p_rejected_by: string; p_request_id: string }
        Returns: Json
      }
      rep_invoice_post_now: { Args: { p_invoice_id: string }; Returns: Json }
      rep_invoice_void_legacy: {
        Args: { p_invoice_id: string; p_reason?: string }
        Returns: Json
      }
      resolve_branch_warehouse: {
        Args: { p_branch_id: string; p_user_id: string }
        Returns: string
      }
      set_task_user_password: {
        Args: { p_new_password: string; p_task_user_id: string }
        Returns: boolean
      }
      sync_pos_tax_ledger: { Args: { p_order_id: string }; Returns: undefined }
      update_last_seen: { Args: never; Returns: undefined }
      update_voucher_atomic: {
        Args: {
          p_allocations?: Json
          p_amount: number
          p_cash_account_code?: string
          p_contact_account_code?: string
          p_contact_id?: string
          p_contact_name?: string
          p_currency: string
          p_description: string
          p_employee_id?: string
          p_exchange_rate?: number
          p_idempotency_key?: string
          p_journal_lines?: Json
          p_kind: string
          p_notes?: string
          p_payment_method: string
          p_reference?: string
          p_transaction_id: string
          p_user_id: string
          p_voucher_date: string
          p_workshop_id?: string
        }
        Returns: Json
      }
      user_can_access: {
        Args: { _module: string; _user_id: string }
        Returns: boolean
      }
      verify_malaki_login: {
        Args: { p_password: string; p_username: string }
        Returns: Json
      }
      verify_task_password: {
        Args: { p_password: string; p_user_id: string }
        Returns: boolean
      }
      void_pos_order: {
        Args: {
          p_cancelled_by_name: string
          p_order_id: string
          p_reason: string
          p_session_id: string
          p_user_id: string
        }
        Returns: Json
      }
      void_rep_sale_atomic: {
        Args: { p_invoice_id: string; p_reason: string }
        Returns: Json
      }
      void_voucher_atomic: {
        Args: {
          p_create_reverse?: boolean
          p_reason?: string
          p_transaction_id: string
          p_user_id: string
          p_void_date?: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "hr_manager"
        | "employee"
        | "super_admin"
        | "accountant_senior"
        | "accountant_sales"
        | "accountant_purchases"
        | "cashier"
        | "worker"
        | "supervisor"
        | "portal"
        | "sales_rep"
        | "branch_scheduler"
      cheque_status:
        | "مسجل"
        | "آجل"
        | "مستحق"
        | "مودع"
        | "محصل"
        | "مرتجع"
        | "ملغي"
        | "مظهر"
        | "مصروف"
      cheque_type: "وارد" | "صادر"
      crm_activity_status: "pending" | "completed" | "cancelled" | "overdue"
      crm_activity_type:
        | "call"
        | "whatsapp"
        | "meeting"
        | "visit"
        | "email"
        | "quote_sent"
        | "collection_reminder"
        | "internal_review"
        | "note"
      crm_lead_status:
        | "new"
        | "contacted"
        | "qualified"
        | "unqualified"
        | "converted"
        | "lost"
      crm_opportunity_stage:
        | "new"
        | "contacted"
        | "qualified"
        | "proposal"
        | "negotiation"
        | "won"
        | "lost"
        | "on_hold"
      crm_priority: "low" | "medium" | "high" | "urgent"
      payroll_status:
        | "submitted"
        | "approved"
        | "paid"
        | "cancelled"
        | "returned"
      product_category:
        | "بضاعة عامة"
        | "مواد خام"
        | "مواد تعبئة"
        | "قطع غيار"
        | "أخرى"
      return_status_enum: "draft" | "confirmed" | "cancelled"
      return_type_enum: "sales" | "purchase"
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
      app_role: [
        "admin",
        "hr_manager",
        "employee",
        "super_admin",
        "accountant_senior",
        "accountant_sales",
        "accountant_purchases",
        "cashier",
        "worker",
        "supervisor",
        "portal",
        "sales_rep",
        "branch_scheduler",
      ],
      cheque_status: [
        "مسجل",
        "آجل",
        "مستحق",
        "مودع",
        "محصل",
        "مرتجع",
        "ملغي",
        "مظهر",
        "مصروف",
      ],
      cheque_type: ["وارد", "صادر"],
      crm_activity_status: ["pending", "completed", "cancelled", "overdue"],
      crm_activity_type: [
        "call",
        "whatsapp",
        "meeting",
        "visit",
        "email",
        "quote_sent",
        "collection_reminder",
        "internal_review",
        "note",
      ],
      crm_lead_status: [
        "new",
        "contacted",
        "qualified",
        "unqualified",
        "converted",
        "lost",
      ],
      crm_opportunity_stage: [
        "new",
        "contacted",
        "qualified",
        "proposal",
        "negotiation",
        "won",
        "lost",
        "on_hold",
      ],
      crm_priority: ["low", "medium", "high", "urgent"],
      payroll_status: [
        "submitted",
        "approved",
        "paid",
        "cancelled",
        "returned",
      ],
      product_category: [
        "بضاعة عامة",
        "مواد خام",
        "مواد تعبئة",
        "قطع غيار",
        "أخرى",
      ],
      return_status_enum: ["draft", "confirmed", "cancelled"],
      return_type_enum: ["sales", "purchase"],
      stock_movement_type: ["وارد", "صادر", "تعديل يدوي"],
    },
  },
} as const

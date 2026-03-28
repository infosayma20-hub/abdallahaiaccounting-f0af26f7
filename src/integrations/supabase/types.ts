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
          is_system: boolean | null
          is_system_protected: boolean | null
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
          is_system?: boolean | null
          is_system_protected?: boolean | null
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
          is_system?: boolean | null
          is_system_protected?: boolean | null
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
          notes: string | null
          overtime_hours: number | null
          status: string
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
          notes?: string | null
          overtime_hours?: number | null
          status?: string
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
          notes?: string | null
          overtime_hours?: number | null
          status?: string
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
        ]
      }
      cheques: {
        Row: {
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
          endorsed_to_contact_id: string | null
          endorsed_to_name: string | null
          id: string
          image_url: string | null
          linked_account: string | null
          linked_transaction_id: string | null
          notes: string | null
          party_name: string
          party_type: string
          receipt_voucher_id: string | null
          source_bank_account_id: string | null
          status: Database["public"]["Enums"]["cheque_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
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
          endorsed_to_contact_id?: string | null
          endorsed_to_name?: string | null
          id?: string
          image_url?: string | null
          linked_account?: string | null
          linked_transaction_id?: string | null
          notes?: string | null
          party_name: string
          party_type?: string
          receipt_voucher_id?: string | null
          source_bank_account_id?: string | null
          status?: Database["public"]["Enums"]["cheque_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
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
          endorsed_to_contact_id?: string | null
          endorsed_to_name?: string | null
          id?: string
          image_url?: string | null
          linked_account?: string | null
          linked_transaction_id?: string | null
          notes?: string | null
          party_name?: string
          party_type?: string
          receipt_voucher_id?: string | null
          source_bank_account_id?: string | null
          status?: Database["public"]["Enums"]["cheque_status"]
          updated_at?: string
          user_id?: string
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
          default_payable_account: string | null
          default_payment_terms: string | null
          default_receivable_account: string | null
          default_revenue_account: string | null
          e_invoice_enabled: boolean | null
          email: string | null
          employee_count_range: string | null
          exchange_rate_source: string | null
          extra_currencies: Json | null
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
          pos_allow_order_transfer: boolean | null
          pos_auto_print: boolean | null
          pos_auto_update_stock: boolean | null
          pos_branch_id: string | null
          pos_count: number | null
          pos_day_cutoff_hour: number | null
          pos_default_opening_balance: number | null
          pos_deficit_alert: boolean | null
          pos_deficit_threshold: number | null
          pos_disable_cogs: boolean
          pos_disable_stock_deduction: boolean
          pos_kitchen_auto_print: boolean | null
          pos_kitchen_ticket_size: string | null
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
          default_payable_account?: string | null
          default_payment_terms?: string | null
          default_receivable_account?: string | null
          default_revenue_account?: string | null
          e_invoice_enabled?: boolean | null
          email?: string | null
          employee_count_range?: string | null
          exchange_rate_source?: string | null
          extra_currencies?: Json | null
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
          pos_allow_order_transfer?: boolean | null
          pos_auto_print?: boolean | null
          pos_auto_update_stock?: boolean | null
          pos_branch_id?: string | null
          pos_count?: number | null
          pos_day_cutoff_hour?: number | null
          pos_default_opening_balance?: number | null
          pos_deficit_alert?: boolean | null
          pos_deficit_threshold?: number | null
          pos_disable_cogs?: boolean
          pos_disable_stock_deduction?: boolean
          pos_kitchen_auto_print?: boolean | null
          pos_kitchen_ticket_size?: string | null
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
          default_payable_account?: string | null
          default_payment_terms?: string | null
          default_receivable_account?: string | null
          default_revenue_account?: string | null
          e_invoice_enabled?: boolean | null
          email?: string | null
          employee_count_range?: string | null
          exchange_rate_source?: string | null
          extra_currencies?: Json | null
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
          pos_allow_order_transfer?: boolean | null
          pos_auto_print?: boolean | null
          pos_auto_update_stock?: boolean | null
          pos_branch_id?: string | null
          pos_count?: number | null
          pos_day_cutoff_hour?: number | null
          pos_default_opening_balance?: number | null
          pos_deficit_alert?: boolean | null
          pos_deficit_threshold?: number | null
          pos_disable_cogs?: boolean
          pos_disable_stock_deduction?: boolean
          pos_kitchen_auto_print?: boolean | null
          pos_kitchen_ticket_size?: string | null
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
          {
            foreignKeyName: "employee_attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
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
          created_at: string
          created_by: string | null
          description: string
          employee_id: string
          id: string
          journal_entry_id: string | null
          movement_date: string
          movement_type: string
          notes: string | null
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
          created_at?: string
          created_by?: string | null
          description: string
          employee_id: string
          id?: string
          journal_entry_id?: string | null
          movement_date?: string
          movement_type: string
          notes?: string | null
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
          created_at?: string
          created_by?: string | null
          description?: string
          employee_id?: string
          id?: string
          journal_entry_id?: string | null
          movement_date?: string
          movement_type?: string
          notes?: string | null
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
          attendance_bonus: number | null
          attendance_salary: number | null
          base_salary: number
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
          period_month: number
          period_year: number
          regular_hours: number | null
          special_allowance: number | null
          total_allowances: number
          total_deductions: number
          total_overtime: number
          user_id: string
          vacation_hours_paid: number | null
          working_days: number | null
        }
        Insert: {
          admin_allowance?: number | null
          annual_allowance?: number | null
          attendance_bonus?: number | null
          attendance_salary?: number | null
          base_salary?: number
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
          period_month: number
          period_year: number
          regular_hours?: number | null
          special_allowance?: number | null
          total_allowances?: number
          total_deductions?: number
          total_overtime?: number
          user_id: string
          vacation_hours_paid?: number | null
          working_days?: number | null
        }
        Update: {
          admin_allowance?: number | null
          annual_allowance?: number | null
          attendance_bonus?: number | null
          attendance_salary?: number | null
          base_salary?: number
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
          period_month?: number
          period_year?: number
          regular_hours?: number | null
          special_allowance?: number | null
          total_allowances?: number
          total_deductions?: number
          total_overtime?: number
          user_id?: string
          vacation_hours_paid?: number | null
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
          child_allowance_per_child: number | null
          children_count: number | null
          company_id: string | null
          contract_type: string | null
          created_at: string
          date_of_birth: string | null
          department: string | null
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
          marital_status: string | null
          meal_allowance_per_day: number | null
          nationality: string | null
          notes: string | null
          other_allowances: number | null
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
          child_allowance_per_child?: number | null
          children_count?: number | null
          company_id?: string | null
          contract_type?: string | null
          created_at?: string
          date_of_birth?: string | null
          department?: string | null
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
          marital_status?: string | null
          meal_allowance_per_day?: number | null
          nationality?: string | null
          notes?: string | null
          other_allowances?: number | null
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
          child_allowance_per_child?: number | null
          children_count?: number | null
          company_id?: string | null
          contract_type?: string | null
          created_at?: string
          date_of_birth?: string | null
          department?: string | null
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
          marital_status?: string | null
          meal_allowance_per_day?: number | null
          nationality?: string | null
          notes?: string | null
          other_allowances?: number | null
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
        ]
      }
      invoice_items: {
        Row: {
          created_at: string | null
          description: string | null
          discount: number | null
          discount_type: string | null
          id: string
          invoice_id: string
          product_id: string | null
          product_name: string
          quantity: number
          tax_rate: number | null
          total_amount: number
          unit_of_measure: string | null
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          discount?: number | null
          discount_type?: string | null
          id?: string
          invoice_id: string
          product_id?: string | null
          product_name: string
          quantity?: number
          tax_rate?: number | null
          total_amount?: number
          unit_of_measure?: string | null
          unit_price?: number
        }
        Update: {
          created_at?: string | null
          description?: string | null
          discount?: number | null
          discount_type?: string | null
          id?: string
          invoice_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          tax_rate?: number | null
          total_amount?: number
          unit_of_measure?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payments: {
        Row: {
          amount: number
          bank_account_id: string | null
          cash_box_id: string | null
          check_date: string | null
          check_number: string | null
          created_at: string | null
          id: string
          invoice_id: string
          linked_transaction_id: string | null
          notes: string | null
          payment_date: string
          payment_method: string | null
          user_id: string
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          cash_box_id?: string | null
          check_date?: string | null
          check_number?: string | null
          created_at?: string | null
          id?: string
          invoice_id: string
          linked_transaction_id?: string | null
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          cash_box_id?: string | null
          check_date?: string | null
          check_number?: string | null
          created_at?: string | null
          id?: string
          invoice_id?: string
          linked_transaction_id?: string | null
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
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
      invoices: {
        Row: {
          amount_in_words: string | null
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
          total_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_in_words?: string | null
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
          total_amount?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_in_words?: string | null
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
          total_amount?: number
          updated_at?: string
          user_id?: string
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
          holiday_date: string
          id: string
          is_recurring: boolean | null
          multiplier: number | null
          name: string
          recurring_day: number | null
          recurring_month: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          holiday_date: string
          id?: string
          is_recurring?: boolean | null
          multiplier?: number | null
          name: string
          recurring_day?: number | null
          recurring_month?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          holiday_date?: string
          id?: string
          is_recurring?: boolean | null
          multiplier?: number | null
          name?: string
          recurring_day?: number | null
          recurring_month?: number | null
          user_id?: string
        }
        Relationships: []
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
      payment_invoice_links: {
        Row: {
          allocated_amount: number
          created_at: string | null
          id: string
          invoice_id: string
          payment_id: string
        }
        Insert: {
          allocated_amount?: number
          created_at?: string | null
          id?: string
          invoice_id: string
          payment_id: string
        }
        Update: {
          allocated_amount?: number
          created_at?: string | null
          id?: string
          invoice_id?: string
          payment_id?: string
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
            foreignKeyName: "payment_invoice_links_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "receipt_vouchers"
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
          annual_discount_pct: number
          annual_price: number | null
          created_at: string
          currency: string | null
          display_order: number
          features: Json
          id: string
          is_active: boolean
          limits: Json | null
          max_companies: number
          max_users: number
          monthly_price: number
          name: string
          name_ar: string
          plan_key: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          annual_discount_pct?: number
          annual_price?: number | null
          created_at?: string
          currency?: string | null
          display_order?: number
          features?: Json
          id?: string
          is_active?: boolean
          limits?: Json | null
          max_companies?: number
          max_users?: number
          monthly_price?: number
          name: string
          name_ar: string
          plan_key: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          annual_discount_pct?: number
          annual_price?: number | null
          created_at?: string
          currency?: string | null
          display_order?: number
          features?: Json
          id?: string
          is_active?: boolean
          limits?: Json | null
          max_companies?: number
          max_users?: number
          monthly_price?: number
          name?: string
          name_ar?: string
          plan_key?: string
          sort_order?: number | null
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
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_orders: {
        Row: {
          cancel_reason: string | null
          cancelled_approved_by: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          company_id: string
          created_at: string
          currency: string
          customer_discount_pct: number | null
          customer_id: string | null
          customer_name: string | null
          delivery_address: string | null
          digital_receipt_sent: boolean | null
          discount_amount: number
          discount_type: string | null
          display_number: string | null
          guest_count: number | null
          guest_name: string | null
          id: string
          ils_equivalent: number | null
          is_return: boolean
          linked_transaction_id: string | null
          local_id: string | null
          notes: string | null
          order_number: string | null
          order_type: string | null
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
          was_offline: boolean | null
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_approved_by?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          company_id: string
          created_at?: string
          currency?: string
          customer_discount_pct?: number | null
          customer_id?: string | null
          customer_name?: string | null
          delivery_address?: string | null
          digital_receipt_sent?: boolean | null
          discount_amount?: number
          discount_type?: string | null
          display_number?: string | null
          guest_count?: number | null
          guest_name?: string | null
          id?: string
          ils_equivalent?: number | null
          is_return?: boolean
          linked_transaction_id?: string | null
          local_id?: string | null
          notes?: string | null
          order_number?: string | null
          order_type?: string | null
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
          was_offline?: boolean | null
        }
        Update: {
          cancel_reason?: string | null
          cancelled_approved_by?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          company_id?: string
          created_at?: string
          currency?: string
          customer_discount_pct?: number | null
          customer_id?: string | null
          customer_name?: string | null
          delivery_address?: string | null
          digital_receipt_sent?: boolean | null
          discount_amount?: number
          discount_type?: string | null
          display_number?: string | null
          guest_count?: number | null
          guest_name?: string | null
          id?: string
          ils_equivalent?: number | null
          is_return?: boolean
          linked_transaction_id?: string | null
          local_id?: string | null
          notes?: string | null
          order_number?: string | null
          order_type?: string | null
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
          was_offline?: boolean | null
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
          id: string
          image_url: string | null
          is_pos_available: boolean | null
          is_weighted: boolean | null
          kitchen_station_id: string | null
          min_quantity: number
          name: string
          notes: string | null
          pos_category_id: string | null
          pos_sort_order: number | null
          quantity: number
          sell_price: number
          sku: string | null
          sort_order: number | null
          tax_rate: number | null
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          barcode?: string | null
          buy_price?: number
          category?: string
          color?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_pos_available?: boolean | null
          is_weighted?: boolean | null
          kitchen_station_id?: string | null
          min_quantity?: number
          name: string
          notes?: string | null
          pos_category_id?: string | null
          pos_sort_order?: number | null
          quantity?: number
          sell_price?: number
          sku?: string | null
          sort_order?: number | null
          tax_rate?: number | null
          unit?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          barcode?: string | null
          buy_price?: number
          category?: string
          color?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_pos_available?: boolean | null
          is_weighted?: boolean | null
          kitchen_station_id?: string | null
          min_quantity?: number
          name?: string
          notes?: string | null
          pos_category_id?: string | null
          pos_sort_order?: number | null
          quantity?: number
          sell_price?: number
          sku?: string | null
          sort_order?: number | null
          tax_rate?: number | null
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
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
          created_at: string | null
          discount_pct: number | null
          id: string
          invoice_id: string
          notes: string | null
          previous_price: number | null
          price_change_pct: number | null
          product_id: string | null
          product_name: string
          quantity: number
          tax_pct: number | null
          total_amount: number
          unit: string | null
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          discount_pct?: number | null
          id?: string
          invoice_id: string
          notes?: string | null
          previous_price?: number | null
          price_change_pct?: number | null
          product_id?: string | null
          product_name: string
          quantity: number
          tax_pct?: number | null
          total_amount: number
          unit?: string | null
          unit_price: number
        }
        Update: {
          created_at?: string | null
          discount_pct?: number | null
          id?: string
          invoice_id?: string
          notes?: string | null
          previous_price?: number | null
          price_change_pct?: number | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          tax_pct?: number | null
          total_amount?: number
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
      receipt_vouchers: {
        Row: {
          amount: number
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
        }
        Insert: {
          amount?: number
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
        }
        Update: {
          amount?: number
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
      salary_slips: {
        Row: {
          absence_deduction: number | null
          absent_days: number | null
          advance_deduction: number | null
          annual_leave_days: number | null
          basic_salary: number | null
          children_allowance: number | null
          created_at: string | null
          employee_id: string
          id: string
          is_paid: boolean | null
          late_deduction: number | null
          meal_allowance: number | null
          net_salary: number | null
          notes: string | null
          official_holiday_days: number | null
          other_allowances: number | null
          other_deductions: number | null
          overtime_amount: number | null
          paid_date: string | null
          period_month: number
          period_year: number
          present_days: number | null
          sick_leave_days: number | null
          social_insurance: number | null
          spouse_allowance: number | null
          total_deductions: number | null
          total_earnings: number | null
          total_paid_days: number | null
          transportation_allowance: number | null
          user_id: string
          weekly_days_off: number | null
          work_days: number | null
        }
        Insert: {
          absence_deduction?: number | null
          absent_days?: number | null
          advance_deduction?: number | null
          annual_leave_days?: number | null
          basic_salary?: number | null
          children_allowance?: number | null
          created_at?: string | null
          employee_id: string
          id?: string
          is_paid?: boolean | null
          late_deduction?: number | null
          meal_allowance?: number | null
          net_salary?: number | null
          notes?: string | null
          official_holiday_days?: number | null
          other_allowances?: number | null
          other_deductions?: number | null
          overtime_amount?: number | null
          paid_date?: string | null
          period_month: number
          period_year: number
          present_days?: number | null
          sick_leave_days?: number | null
          social_insurance?: number | null
          spouse_allowance?: number | null
          total_deductions?: number | null
          total_earnings?: number | null
          total_paid_days?: number | null
          transportation_allowance?: number | null
          user_id: string
          weekly_days_off?: number | null
          work_days?: number | null
        }
        Update: {
          absence_deduction?: number | null
          absent_days?: number | null
          advance_deduction?: number | null
          annual_leave_days?: number | null
          basic_salary?: number | null
          children_allowance?: number | null
          created_at?: string | null
          employee_id?: string
          id?: string
          is_paid?: boolean | null
          late_deduction?: number | null
          meal_allowance?: number | null
          net_salary?: number | null
          notes?: string | null
          official_holiday_days?: number | null
          other_allowances?: number | null
          other_deductions?: number | null
          overtime_amount?: number | null
          paid_date?: string | null
          period_month?: number
          period_year?: number
          present_days?: number | null
          sick_leave_days?: number | null
          social_insurance?: number | null
          spouse_allowance?: number | null
          total_deductions?: number | null
          total_earnings?: number | null
          total_paid_days?: number | null
          transportation_allowance?: number | null
          user_id?: string
          weekly_days_off?: number | null
          work_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "salary_slips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_slips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
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
      stock_valuation_layers: {
        Row: {
          company_id: string
          created_at: string
          id: string
          layer_date: string
          move_type: string
          product_id: string
          qty: number
          reference: string | null
          remaining_qty: number
          remaining_value: number
          unit_cost: number
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          layer_date?: string
          move_type?: string
          product_id: string
          qty?: number
          reference?: string | null
          remaining_qty?: number
          remaining_value?: number
          unit_cost?: number
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          layer_date?: string
          move_type?: string
          product_id?: string
          qty?: number
          reference?: string | null
          remaining_qty?: number
          remaining_value?: number
          unit_cost?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_valuation_layers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "pos_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_valuation_layers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
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
          assigned_to: string | null
          category: string | null
          completed_at: string | null
          completed_by: string | null
          completion_note: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          due_date: string | null
          due_time: string | null
          id: string
          is_visible_to_all: boolean | null
          priority: string
          status: string
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          category?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completion_note?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          id?: string
          is_visible_to_all?: boolean | null
          priority?: string
          status?: string
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          category?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completion_note?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          id?: string
          is_visible_to_all?: boolean | null
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
          created_at: string
          credit_account_code: string
          currency: string
          debit_account_code: string
          description: string
          exchange_rate: number | null
          foreign_amount: number | null
          id: string
          idempotency_key: string | null
          is_deleted: boolean | null
          is_opening_balance: boolean | null
          notes: string | null
          payment_method: string | null
          reference: string | null
          transaction_date: string
          transaction_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id_credit?: string | null
          account_id_debit?: string | null
          amount?: number
          contact_id?: string | null
          created_at?: string
          credit_account_code: string
          currency?: string
          debit_account_code: string
          description: string
          exchange_rate?: number | null
          foreign_amount?: number | null
          id?: string
          idempotency_key?: string | null
          is_deleted?: boolean | null
          is_opening_balance?: boolean | null
          notes?: string | null
          payment_method?: string | null
          reference?: string | null
          transaction_date?: string
          transaction_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id_credit?: string | null
          account_id_debit?: string | null
          amount?: number
          contact_id?: string | null
          created_at?: string
          credit_account_code?: string
          currency?: string
          debit_account_code?: string
          description?: string
          exchange_rate?: number | null
          foreign_amount?: number | null
          id?: string
          idempotency_key?: string | null
          is_deleted?: boolean | null
          is_opening_balance?: boolean | null
          notes?: string | null
          payment_method?: string | null
          reference?: string | null
          transaction_date?: string
          transaction_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
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
          bank_account_id: string | null
          cheque_bank_name: string | null
          cheque_due_date: string | null
          cheque_number: string | null
          contact_id: string | null
          created_at: string | null
          currency: string | null
          date: string
          description: string
          exchange_rate: number | null
          id: string
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
        }
        Insert: {
          amount?: number | null
          amount_ils?: number | null
          bank_account_id?: string | null
          cheque_bank_name?: string | null
          cheque_due_date?: string | null
          cheque_number?: string | null
          contact_id?: string | null
          created_at?: string | null
          currency?: string | null
          date?: string
          description: string
          exchange_rate?: number | null
          id?: string
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
        }
        Update: {
          amount?: number | null
          amount_ils?: number | null
          bank_account_id?: string | null
          cheque_bank_name?: string | null
          cheque_due_date?: string | null
          cheque_number?: string | null
          contact_id?: string | null
          created_at?: string | null
          currency?: string | null
          date?: string
          description?: string
          exchange_rate?: number | null
          id?: string
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
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
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
      work_shifts: {
        Row: {
          break_duration_minutes: number | null
          created_at: string | null
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
    }
    Functions: {
      approve_procurement_request: {
        Args: { p_approved_by: string; p_request_id: string }
        Returns: Json
      }
      cleanup_expired_webauthn_challenges: { Args: never; Returns: undefined }
      clear_must_change_password: { Args: never; Returns: boolean }
      complete_pos_order: {
        Args: { p_order_id: string; p_payments: Json; p_user_id: string }
        Returns: Json
      }
      create_invoice_with_entry: {
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
      create_payment_with_entry: {
        Args: {
          p_amount: number
          p_contact_id: string
          p_contact_name: string
          p_currency?: string
          p_description?: string
          p_idempotency_key?: string
          p_payment_method?: string
          p_user_id: string
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
          p_amount: number
          p_contact_id: string
          p_contact_name: string
          p_currency?: string
          p_description?: string
          p_idempotency_key?: string
          p_payment_method?: string
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
      get_cash_box_balance: { Args: { p_box_id: string }; Returns: number }
      get_exchange_rate: {
        Args: { p_currency_code: string; p_date?: string; p_rate_type?: string }
        Returns: number
      }
      get_team_owner_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
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
      reject_procurement_request: {
        Args: { p_reason?: string; p_rejected_by: string; p_request_id: string }
        Returns: Json
      }
      set_task_user_password: {
        Args: { p_new_password: string; p_task_user_id: string }
        Returns: boolean
      }
      update_last_seen: { Args: never; Returns: undefined }
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

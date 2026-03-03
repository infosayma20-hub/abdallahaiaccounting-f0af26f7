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
      accounts: {
        Row: {
          account_code: string
          account_name: string
          account_type: string
          created_at: string
          id: string
          is_active: boolean | null
          is_system: boolean | null
          notes: string | null
          parent_code: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_code: string
          account_name: string
          account_type?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          notes?: string | null
          parent_code?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_code?: string
          account_name?: string
          account_type?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          notes?: string | null
          parent_code?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      branches: {
        Row: {
          address: string | null
          created_at: string
          id: string
          is_active: boolean
          latitude: number
          longitude: number
          name: string
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
          qr_rotation_minutes?: number
          radius_meters?: number
          secret_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
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
          linked_transaction_id: string | null
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
          linked_transaction_id?: string | null
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
          linked_transaction_id?: string | null
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
      contacts: {
        Row: {
          address: string | null
          contact_name: string
          contact_type: string
          created_at: string
          email: string | null
          id: string
          is_active: boolean | null
          linked_account_code: string | null
          notes: string | null
          phone: string | null
          tax_number: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          contact_name: string
          contact_type?: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          linked_account_code?: string | null
          notes?: string | null
          phone?: string | null
          tax_number?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          contact_name?: string
          contact_type?: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          linked_account_code?: string | null
          notes?: string | null
          phone?: string | null
          tax_number?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      correction_requests: {
        Row: {
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
          {
            foreignKeyName: "employee_deductions_employee_id_fkey"
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
      employee_payroll: {
        Row: {
          base_salary: number
          created_at: string
          employee_id: string
          id: string
          is_paid: boolean
          linked_transaction_id: string | null
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
          linked_transaction_id?: string | null
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
          linked_transaction_id?: string | null
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
          {
            foreignKeyName: "employee_payroll_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          address: string | null
          annual_leave_days: number
          auth_user_id: string | null
          bank_account: string | null
          bank_name: string | null
          base_salary: number
          branch_id: string | null
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
          auth_user_id?: string | null
          bank_account?: string | null
          bank_name?: string | null
          base_salary?: number
          branch_id?: string | null
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
          auth_user_id?: string | null
          bank_account?: string | null
          bank_name?: string | null
          base_salary?: number
          branch_id?: string | null
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
      exchange_rates: {
        Row: {
          buy_rate: number
          created_at: string
          currency_id: string
          id: string
          mid_rate: number
          notes: string | null
          rate_date: string
          sell_rate: number
          source: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          buy_rate?: number
          created_at?: string
          currency_id: string
          id?: string
          mid_rate?: number
          notes?: string | null
          rate_date?: string
          sell_rate?: number
          source?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          buy_rate?: number
          created_at?: string
          currency_id?: string
          id?: string
          mid_rate?: number
          notes?: string | null
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
      plans: {
        Row: {
          annual_discount_pct: number
          created_at: string
          display_order: number
          features: Json
          id: string
          is_active: boolean
          max_companies: number
          max_users: number
          monthly_price: number
          name: string
          name_ar: string
          plan_key: string
          updated_at: string
        }
        Insert: {
          annual_discount_pct?: number
          created_at?: string
          display_order?: number
          features?: Json
          id?: string
          is_active?: boolean
          max_companies?: number
          max_users?: number
          monthly_price?: number
          name: string
          name_ar: string
          plan_key: string
          updated_at?: string
        }
        Update: {
          annual_discount_pct?: number
          created_at?: string
          display_order?: number
          features?: Json
          id?: string
          is_active?: boolean
          max_companies?: number
          max_users?: number
          monthly_price?: number
          name?: string
          name_ar?: string
          plan_key?: string
          updated_at?: string
        }
        Relationships: []
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
          company_id: string
          created_at: string
          currency: string
          customer_id: string | null
          customer_name: string | null
          discount_amount: number
          discount_type: string | null
          id: string
          is_return: boolean
          linked_transaction_id: string | null
          notes: string | null
          order_number: string | null
          return_of_order_id: string | null
          return_reason: string | null
          session_id: string
          state: string
          subtotal: number
          tax_amount: number
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          currency?: string
          customer_id?: string | null
          customer_name?: string | null
          discount_amount?: number
          discount_type?: string | null
          id?: string
          is_return?: boolean
          linked_transaction_id?: string | null
          notes?: string | null
          order_number?: string | null
          return_of_order_id?: string | null
          return_reason?: string | null
          session_id: string
          state?: string
          subtotal?: number
          tax_amount?: number
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          currency?: string
          customer_id?: string | null
          customer_name?: string | null
          discount_amount?: number
          discount_type?: string | null
          id?: string
          is_return?: boolean
          linked_transaction_id?: string | null
          notes?: string | null
          order_number?: string | null
          return_of_order_id?: string | null
          return_reason?: string | null
          session_id?: string
          state?: string
          subtotal?: number
          tax_amount?: number
          total?: number
          updated_at?: string
          user_id?: string
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
        ]
      }
      pos_payments: {
        Row: {
          amount: number
          change_amount: number
          cheque_date: string | null
          cheque_number: string | null
          created_at: string
          currency: string
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
          cheque_date?: string | null
          cheque_number?: string | null
          created_at?: string
          currency?: string
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
          cheque_date?: string | null
          cheque_number?: string | null
          created_at?: string
          currency?: string
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
      pos_sessions: {
        Row: {
          approved_by_pos_user_id: string | null
          cash_variance: number | null
          cashier_name: string | null
          cashier_pos_user_id: string | null
          closed_at: string | null
          closing_cash: number | null
          company_id: string
          created_at: string
          device_id: string | null
          expected_cash: number | null
          id: string
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
          cash_variance?: number | null
          cashier_name?: string | null
          cashier_pos_user_id?: string | null
          closed_at?: string | null
          closing_cash?: number | null
          company_id: string
          created_at?: string
          device_id?: string | null
          expected_cash?: number | null
          id?: string
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
          cash_variance?: number | null
          cashier_name?: string | null
          cashier_pos_user_id?: string | null
          closed_at?: string | null
          closing_cash?: number | null
          company_id?: string
          created_at?: string
          device_id?: string | null
          expected_cash?: number | null
          id?: string
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
          can_apply_discount: boolean
          can_close_register: boolean
          can_edit_prices: boolean
          can_open_register: boolean
          can_refund: boolean
          can_view_profits: boolean
          can_view_shift_details: boolean
          can_void_sales: boolean
          company_id: string
          created_at: string
          id: string
          max_discount_percent: number
          pos_user_id: string
          require_manager_approval: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          can_apply_discount?: boolean
          can_close_register?: boolean
          can_edit_prices?: boolean
          can_open_register?: boolean
          can_refund?: boolean
          can_view_profits?: boolean
          can_view_shift_details?: boolean
          can_void_sales?: boolean
          company_id: string
          created_at?: string
          id?: string
          max_discount_percent?: number
          pos_user_id: string
          require_manager_approval?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          can_apply_discount?: boolean
          can_close_register?: boolean
          can_edit_prices?: boolean
          can_open_register?: boolean
          can_refund?: boolean
          can_view_profits?: boolean
          can_view_shift_details?: boolean
          can_void_sales?: boolean
          company_id?: string
          created_at?: string
          id?: string
          max_discount_percent?: number
          pos_user_id?: string
          require_manager_approval?: boolean
          updated_at?: string
          user_id?: string
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
      pos_users: {
        Row: {
          avatar_url: string | null
          company_id: string
          created_at: string
          created_by: string | null
          email: string | null
          employee_id: string | null
          id: string
          is_active: boolean
          last_login_at: string | null
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
          avatar_url?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          employee_id?: string | null
          id?: string
          is_active?: boolean
          last_login_at?: string | null
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
          avatar_url?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          employee_id?: string | null
          id?: string
          is_active?: boolean
          last_login_at?: string | null
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
          min_quantity: number
          name: string
          notes: string | null
          pos_category_id: string | null
          pos_sort_order: number | null
          quantity: number
          sell_price: number
          sku: string | null
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
          min_quantity?: number
          name: string
          notes?: string | null
          pos_category_id?: string | null
          pos_sort_order?: number | null
          quantity?: number
          sell_price?: number
          sku?: string | null
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
          min_quantity?: number
          name?: string
          notes?: string | null
          pos_category_id?: string | null
          pos_sort_order?: number | null
          quantity?: number
          sell_price?: number
          sku?: string | null
          tax_rate?: number | null
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
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
          billing_cycle: string
          cancelled_at: string | null
          created_at: string
          current_period_end: string
          current_period_start: string
          id: string
          plan_id: string
          status: string
          trial_ends_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_cycle?: string
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          plan_id: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_cycle?: string
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          plan_id?: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
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
      cleanup_expired_webauthn_challenges: { Args: never; Returns: undefined }
      complete_pos_order: {
        Args: { p_order_id: string; p_payments?: Json; p_user_id: string }
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
      get_exchange_rate: {
        Args: { p_currency_code: string; p_date?: string; p_rate_type?: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
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
    }
    Enums: {
      app_role: "admin" | "hr_manager" | "employee" | "super_admin"
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
      app_role: ["admin", "hr_manager", "employee", "super_admin"],
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

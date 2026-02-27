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
          created_at: string
          decimal_places: number
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
          created_at?: string
          decimal_places?: number
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
          created_at?: string
          decimal_places?: number
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
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
    }
    Enums: {
      app_role: "admin" | "hr_manager" | "employee"
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
      app_role: ["admin", "hr_manager", "employee"],
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

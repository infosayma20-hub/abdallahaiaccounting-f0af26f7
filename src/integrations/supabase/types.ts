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

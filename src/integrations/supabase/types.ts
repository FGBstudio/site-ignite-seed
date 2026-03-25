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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          changed_field: string
          created_at: string
          id: string
          new_value: string | null
          old_value: string | null
          project_id: string | null
          user_id: string
        }
        Insert: {
          changed_field: string
          created_at?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          project_id?: string | null
          user_id: string
        }
        Update: {
          changed_field?: string
          created_at?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          project_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          holding_id: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          holding_id: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          holding_id?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brands_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
        ]
      }
      certification_milestones: {
        Row: {
          category: string
          certification_id: string
          created_at: string
          evidence_url: string | null
          id: string
          max_score: number
          notes: string | null
          requirement: string
          score: number
          status: Database["public"]["Enums"]["milestone_status"]
          updated_at: string
        }
        Insert: {
          category: string
          certification_id: string
          created_at?: string
          evidence_url?: string | null
          id?: string
          max_score?: number
          notes?: string | null
          requirement: string
          score?: number
          status?: Database["public"]["Enums"]["milestone_status"]
          updated_at?: string
        }
        Update: {
          category?: string
          certification_id?: string
          created_at?: string
          evidence_url?: string | null
          id?: string
          max_score?: number
          notes?: string | null
          requirement?: string
          score?: number
          status?: Database["public"]["Enums"]["milestone_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "certification_milestones_certification_id_fkey"
            columns: ["certification_id"]
            isOneToOne: false
            referencedRelation: "certifications"
            referencedColumns: ["id"]
          },
        ]
      }
      certifications: {
        Row: {
          cert_type: Database["public"]["Enums"]["project_type"]
          created_at: string
          id: string
          project_id: string | null
          score: number
          site_id: string | null
          target_score: number
          updated_at: string
        }
        Insert: {
          cert_type: Database["public"]["Enums"]["project_type"]
          created_at?: string
          id?: string
          project_id?: string | null
          score?: number
          site_id?: string | null
          target_score?: number
          updated_at?: string
        }
        Update: {
          cert_type?: Database["public"]["Enums"]["project_type"]
          created_at?: string
          id?: string
          project_id?: string | null
          score?: number
          site_id?: string | null
          target_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "certifications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certifications_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          created_at: string | null
          id: string
          site_id: string | null
          status: string
          total_amount: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          site_id?: string | null
          status?: string
          total_amount?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          site_id?: string | null
          status?: string
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      holdings: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_milestones: {
        Row: {
          amount: number
          created_at: string | null
          due_date: string | null
          id: string
          milestone_name: string
          project_id: string | null
          status: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          due_date?: string | null
          id?: string
          milestone_name: string
          project_id?: string | null
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          due_date?: string | null
          id?: string
          milestone_name?: string
          project_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          certification: Database["public"]["Enums"]["certification_type"]
          created_at: string
          id: string
          name: string
          quantity_in_stock: number
          sku: string
          supplier_lead_time_days: number
          updated_at: string
        }
        Insert: {
          certification: Database["public"]["Enums"]["certification_type"]
          created_at?: string
          id?: string
          name: string
          quantity_in_stock?: number
          sku: string
          supplier_lead_time_days?: number
          updated_at?: string
        }
        Update: {
          certification?: Database["public"]["Enums"]["certification_type"]
          created_at?: string
          id?: string
          name?: string
          quantity_in_stock?: number
          sku?: string
          supplier_lead_time_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_allocations: {
        Row: {
          created_at: string
          id: string
          product_id: string
          project_id: string
          quantity: number
          status: Database["public"]["Enums"]["allocation_status"]
          target_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          project_id: string
          quantity: number
          status?: Database["public"]["Enums"]["allocation_status"]
          target_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          project_id?: string
          quantity?: number
          status?: Database["public"]["Enums"]["allocation_status"]
          target_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_allocations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_allocations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_tasks: {
        Row: {
          assigned_to: string | null
          blocking_payment_id: string | null
          created_at: string | null
          dependency_id: string | null
          end_date: string | null
          id: string
          project_id: string | null
          start_date: string | null
          status: string
          task_name: string
        }
        Insert: {
          assigned_to?: string | null
          blocking_payment_id?: string | null
          created_at?: string | null
          dependency_id?: string | null
          end_date?: string | null
          id?: string
          project_id?: string | null
          start_date?: string | null
          status?: string
          task_name: string
        }
        Update: {
          assigned_to?: string | null
          blocking_payment_id?: string | null
          created_at?: string | null
          dependency_id?: string | null
          end_date?: string | null
          id?: string
          project_id?: string | null
          start_date?: string | null
          status?: string
          task_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_tasks_blocking_payment_id_fkey"
            columns: ["blocking_payment_id"]
            isOneToOne: false
            referencedRelation: "payment_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_dependency_id_fkey"
            columns: ["dependency_id"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          client: string
          created_at: string
          handover_date: string
          id: string
          name: string
          pm_id: string | null
          project_type: Database["public"]["Enums"]["project_type"] | null
          region: Database["public"]["Enums"]["region"]
          site_id: string | null
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
        }
        Insert: {
          client: string
          created_at?: string
          handover_date: string
          id?: string
          name: string
          pm_id?: string | null
          project_type?: Database["public"]["Enums"]["project_type"] | null
          region: Database["public"]["Enums"]["region"]
          site_id?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Update: {
          client?: string
          created_at?: string
          handover_date?: string
          id?: string
          name?: string
          pm_id?: string | null
          project_type?: Database["public"]["Enums"]["project_type"] | null
          region?: Database["public"]["Enums"]["region"]
          site_id?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_pm_id_fkey"
            columns: ["pm_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          address: string | null
          brand_id: string | null
          city: string | null
          country: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          brand_id?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          brand_id?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sites_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_orders: {
        Row: {
          created_at: string
          expected_delivery_date: string
          id: string
          product_id: string
          quantity_requested: number
          status: Database["public"]["Enums"]["supplier_order_status"]
          supplier_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expected_delivery_date: string
          id?: string
          product_id: string
          quantity_requested: number
          status?: Database["public"]["Enums"]["supplier_order_status"]
          supplier_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expected_delivery_date?: string
          id?: string
          product_id?: string
          quantity_requested?: number
          status?: Database["public"]["Enums"]["supplier_order_status"]
          supplier_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      view_resource_saturation: {
        Row: {
          next_deadline: string | null
          total_active_tasks: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      allocation_status:
        | "Draft"
        | "Allocated"
        | "Requested"
        | "Shipped"
        | "Installed_Online"
      app_role:
        | "ADMIN"
        | "PM"
        | "document_manager"
        | "specialist"
        | "energy_modeler"
        | "cxa"
      certification_type: "LEED" | "WELL" | "CO2" | "CO2-CO" | "Energy"
      milestone_status: "pending" | "in_progress" | "completed"
      project_status: "Design" | "Construction" | "Completed" | "Cancelled"
      project_type: "LEED" | "WELL" | "Monitoring" | "Consulting"
      region: "Europe" | "America" | "APAC" | "ME"
      supplier_order_status: "Draft" | "Sent" | "In_Transit" | "Received"
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
      allocation_status: [
        "Draft",
        "Allocated",
        "Requested",
        "Shipped",
        "Installed_Online",
      ],
      app_role: [
        "ADMIN",
        "PM",
        "document_manager",
        "specialist",
        "energy_modeler",
        "cxa",
      ],
      certification_type: ["LEED", "WELL", "CO2", "CO2-CO", "Energy"],
      milestone_status: ["pending", "in_progress", "completed"],
      project_status: ["Design", "Construction", "Completed", "Cancelled"],
      project_type: ["LEED", "WELL", "Monitoring", "Consulting"],
      region: ["Europe", "America", "APAC", "ME"],
      supplier_order_status: ["Draft", "Sent", "In_Transit", "Received"],
    },
  },
} as const

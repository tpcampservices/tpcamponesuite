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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      access_entitlements: {
        Row: {
          access_expiry_date: string | null
          access_start_date: string | null
          access_status: string
          addons: Json
          admin_notes: string | null
          allowed_apps: Json | null
          billing_period: string | null
          created_at: string
          currency: string
          granted_at: string | null
          granted_by: string | null
          payment_status: string
          plan_id: string | null
          seats_extra: number
          seats_limit: number | null
          status: string
          subscription_source: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          access_expiry_date?: string | null
          access_start_date?: string | null
          access_status?: string
          addons?: Json
          admin_notes?: string | null
          allowed_apps?: Json | null
          billing_period?: string | null
          created_at?: string
          currency?: string
          granted_at?: string | null
          granted_by?: string | null
          payment_status?: string
          plan_id?: string | null
          seats_extra?: number
          seats_limit?: number | null
          status?: string
          subscription_source?: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          access_expiry_date?: string | null
          access_start_date?: string | null
          access_status?: string
          addons?: Json
          admin_notes?: string | null
          allowed_apps?: Json | null
          billing_period?: string | null
          created_at?: string
          currency?: string
          granted_at?: string | null
          granted_by?: string | null
          payment_status?: string
          plan_id?: string | null
          seats_extra?: number
          seats_limit?: number | null
          status?: string
          subscription_source?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_entitlements_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_access_audit: {
        Row: {
          action: string
          actor_email: string | null
          actor_user_id: string | null
          created_at: string
          details: Json
          id: string
          new_expiry_date: string | null
          new_payment_status: string | null
          new_plan_id: string | null
          new_status: string | null
          new_subscription_source: string | null
          old_expiry_date: string | null
          old_payment_status: string | null
          old_plan_id: string | null
          old_status: string | null
          old_subscription_source: string | null
          reason: string | null
          target_user_id: string | null
          target_workspace: string | null
        }
        Insert: {
          action?: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          new_expiry_date?: string | null
          new_payment_status?: string | null
          new_plan_id?: string | null
          new_status?: string | null
          new_subscription_source?: string | null
          old_expiry_date?: string | null
          old_payment_status?: string | null
          old_plan_id?: string | null
          old_status?: string | null
          old_subscription_source?: string | null
          reason?: string | null
          target_user_id?: string | null
          target_workspace?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          new_expiry_date?: string | null
          new_payment_status?: string | null
          new_plan_id?: string | null
          new_status?: string | null
          new_subscription_source?: string | null
          old_expiry_date?: string | null
          old_payment_status?: string | null
          old_plan_id?: string | null
          old_status?: string | null
          old_subscription_source?: string | null
          reason?: string | null
          target_user_id?: string | null
          target_workspace?: string | null
        }
        Relationships: []
      }
      business_profiles: {
        Row: {
          address: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          default_currency: string
          governing_law: string
          id: string
          legal_name: string
          registration_number: string | null
          signatory_name: string | null
          signatory_title: string | null
          trading_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          default_currency?: string
          governing_law?: string
          id?: string
          legal_name: string
          registration_number?: string | null
          signatory_name?: string | null
          signatory_title?: string | null
          trading_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          default_currency?: string
          governing_law?: string
          id?: string
          legal_name?: string
          registration_number?: string | null
          signatory_name?: string | null
          signatory_title?: string | null
          trading_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      contact_messages: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
          subject: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          subject?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          subject?: string | null
        }
        Relationships: []
      }
      contracts: {
        Row: {
          counterparty: string | null
          created_at: string
          generated_at: string | null
          id: string
          status: string
          template_id: string
          template_title: string
          title: string
          updated_at: string
          user_id: string
          values: Json
        }
        Insert: {
          counterparty?: string | null
          created_at?: string
          generated_at?: string | null
          id?: string
          status?: string
          template_id: string
          template_title: string
          title: string
          updated_at?: string
          user_id: string
          values?: Json
        }
        Update: {
          counterparty?: string | null
          created_at?: string
          generated_at?: string | null
          id?: string
          status?: string
          template_id?: string
          template_title?: string
          title?: string
          updated_at?: string
          user_id?: string
          values?: Json
        }
        Relationships: []
      }
      integration_settings: {
        Row: {
          created_at: string
          key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          created_at?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          created_at?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      paypal_plans: {
        Row: {
          active: boolean
          amount: number | null
          created_at: string
          currency: string
          cycle: string
          label: string | null
          plan_id: string
          tier: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount?: number | null
          created_at?: string
          currency?: string
          cycle: string
          label?: string | null
          plan_id: string
          tier: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount?: number | null
          created_at?: string
          currency?: string
          cycle?: string
          label?: string | null
          plan_id?: string
          tier?: number
          updated_at?: string
        }
        Relationships: []
      }
      paypal_webhook_diagnostics: {
        Row: {
          created_at: string
          environment: string | null
          event_id: string | null
          event_type: string | null
          headers_present: Json | null
          http_status: number | null
          id: string
          note: string | null
          outcome: string
          paypal_debug_id: string | null
          received_at: string
          rejection_reason: string | null
          signature_result: string | null
        }
        Insert: {
          created_at?: string
          environment?: string | null
          event_id?: string | null
          event_type?: string | null
          headers_present?: Json | null
          http_status?: number | null
          id?: string
          note?: string | null
          outcome?: string
          paypal_debug_id?: string | null
          received_at?: string
          rejection_reason?: string | null
          signature_result?: string | null
        }
        Update: {
          created_at?: string
          environment?: string | null
          event_id?: string | null
          event_type?: string | null
          headers_present?: Json | null
          http_status?: number | null
          id?: string
          note?: string | null
          outcome?: string
          paypal_debug_id?: string | null
          received_at?: string
          rejection_reason?: string | null
          signature_result?: string | null
        }
        Relationships: []
      }
      paypal_webhook_events: {
        Row: {
          applied: boolean
          created_at: string
          duplicate: boolean
          event_id: string
          event_type: string
          id: string
          new_status: string | null
          note: string | null
          payload: Json | null
          plan_id: string | null
          previous_status: string | null
          resource_id: string | null
          subscription_reference: string | null
          user_id: string | null
        }
        Insert: {
          applied?: boolean
          created_at?: string
          duplicate?: boolean
          event_id: string
          event_type: string
          id?: string
          new_status?: string | null
          note?: string | null
          payload?: Json | null
          plan_id?: string | null
          previous_status?: string | null
          resource_id?: string | null
          subscription_reference?: string | null
          user_id?: string | null
        }
        Update: {
          applied?: boolean
          created_at?: string
          duplicate?: boolean
          event_id?: string
          event_type?: string
          id?: string
          new_status?: string | null
          note?: string | null
          payload?: Json | null
          plan_id?: string | null
          previous_status?: string | null
          resource_id?: string | null
          subscription_reference?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      plan_limit_usage: {
        Row: {
          id: string
          metric: string
          period_key: string
          updated_at: string
          used: number
          user_id: string
        }
        Insert: {
          id?: string
          metric: string
          period_key: string
          updated_at?: string
          used?: number
          user_id: string
        }
        Update: {
          id?: string
          metric?: string
          period_key?: string
          updated_at?: string
          used?: number
          user_id?: string
        }
        Relationships: []
      }
      plan_orders: {
        Row: {
          access_expiry_date: string | null
          access_start_date: string | null
          add_on_total: number
          addons: Json
          base_price: number
          billing_period: string
          capture_status: string | null
          captured_amount: number | null
          captured_at: string | null
          captured_currency: string | null
          created_at: string
          currency: string
          id: string
          last_error: string | null
          onboarding_fee: number
          organization_id: string | null
          paid_at: string | null
          payment_provider: string
          payment_status: string
          paypal_capture_id: string | null
          paypal_order_id: string | null
          plan_id: string
          total_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          access_expiry_date?: string | null
          access_start_date?: string | null
          add_on_total?: number
          addons?: Json
          base_price?: number
          billing_period: string
          capture_status?: string | null
          captured_amount?: number | null
          captured_at?: string | null
          captured_currency?: string | null
          created_at?: string
          currency: string
          id?: string
          last_error?: string | null
          onboarding_fee?: number
          organization_id?: string | null
          paid_at?: string | null
          payment_provider?: string
          payment_status?: string
          paypal_capture_id?: string | null
          paypal_order_id?: string | null
          plan_id: string
          total_amount?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          access_expiry_date?: string | null
          access_start_date?: string | null
          add_on_total?: number
          addons?: Json
          base_price?: number
          billing_period?: string
          capture_status?: string | null
          captured_amount?: number | null
          captured_at?: string | null
          captured_currency?: string | null
          created_at?: string
          currency?: string
          id?: string
          last_error?: string | null
          onboarding_fee?: number
          organization_id?: string | null
          paid_at?: string | null
          payment_provider?: string
          payment_status?: string
          paypal_capture_id?: string | null
          paypal_order_id?: string | null
          plan_id?: string
          total_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          country: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          organisation: string | null
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          organisation?: string | null
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          organisation?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sso_tickets: {
        Row: {
          app_slug: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          token_hash: string
          user_id: string
        }
        Insert: {
          app_slug: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          token_hash: string
          user_id: string
        }
        Update: {
          app_slug?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          token_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          amount: number | null
          created_at: string
          currency: string
          expires_at: string | null
          id: string
          payment_provider: string | null
          payment_reference: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          tier: number
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          currency?: string
          expires_at?: string | null
          id?: string
          payment_provider?: string | null
          payment_reference?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          tier: number
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          currency?: string
          expires_at?: string | null
          id?: string
          payment_provider?: string | null
          payment_reference?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          tier?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      team_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          details: Json
          id: string
          role_key: string | null
          target_email: string | null
          target_user_id: string | null
          workspace_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          role_key?: string | null
          target_email?: string | null
          target_user_id?: string | null
          workspace_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          role_key?: string | null
          target_email?: string | null
          target_user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_audit_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
      workspace_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by_user_id: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          display_name: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          last_sent_at: string
          metadata: Json
          resend_count: number
          role_id: string
          status: string
          token_hash: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          expires_at: string
          id?: string
          invited_by?: string | null
          last_sent_at?: string
          metadata?: Json
          resend_count?: number
          role_id: string
          status?: string
          token_hash: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          last_sent_at?: string
          metadata?: Json
          resend_count?: number
          role_id?: string
          status?: string
          token_hash?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "workspace_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_member_app_access: {
        Row: {
          access_level: string
          app_key: string
          created_at: string
          id: string
          membership_id: string
          updated_at: string
        }
        Insert: {
          access_level?: string
          app_key: string
          created_at?: string
          id?: string
          membership_id: string
          updated_at?: string
        }
        Update: {
          access_level?: string
          app_key?: string
          created_at?: string
          id?: string
          membership_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_member_app_access_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "workspace_memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_member_permission_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          effect: string
          id: string
          membership_id: string
          permission_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effect: string
          id?: string
          membership_id: string
          permission_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effect?: string
          id?: string
          membership_id?: string
          permission_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_member_permission_overrides_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "workspace_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_member_permission_overrides_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "workspace_permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_member_permission_overrides_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_memberships: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          joined_at: string | null
          role_id: string
          status: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          role_id: string
          status?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          role_id?: string
          status?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_memberships_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "workspace_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_memberships_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_permissions: {
        Row: {
          action_key: string
          app_key: string
          created_at: string
          description: string | null
          id: string
          permission_key: string
        }
        Insert: {
          action_key: string
          app_key: string
          created_at?: string
          description?: string | null
          id?: string
          permission_key: string
        }
        Update: {
          action_key?: string
          app_key?: string
          created_at?: string
          description?: string | null
          id?: string
          permission_key?: string
        }
        Relationships: []
      }
      workspace_role_permissions: {
        Row: {
          created_at: string
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "workspace_permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "workspace_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_protected: boolean
          is_system: boolean
          name: string
          rank: number
          role_key: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_protected?: boolean
          is_system?: boolean
          name: string
          rank?: number
          role_key: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_protected?: boolean
          is_system?: boolean
          name?: string
          rank?: number
          role_key?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspace_roles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_user_id: string
          slug: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_user_id: string
          slug?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_user_id?: string
          slug?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_workspace_invitation: {
        Args: {
          _app_access: Json
          _email: string
          _token_hash: string
          _total_seats: number
          _user_id: string
        }
        Returns: Json
      }
      create_workspace_invitation: {
        Args: {
          _display_name: string
          _email: string
          _expires_at: string
          _invited_by: string
          _role_id: string
          _token_hash: string
          _total_seats: number
          _workspace_id: string
        }
        Returns: string
      }
      get_workspace_role: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_tier_access: {
        Args: { _tier: number; _user_id: string }
        Returns: boolean
      }
      has_workspace_permission: {
        Args: {
          _permission_key: string
          _user_id: string
          _workspace_id: string
        }
        Returns: boolean
      }
      is_active_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      provision_user_workspace: { Args: { _user_id: string }; Returns: string }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "member"
      subscription_status: "pending" | "active" | "cancelled" | "expired"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["super_admin", "admin", "member"],
      subscription_status: ["pending", "active", "cancelled", "expired"],
    },
  },
} as const

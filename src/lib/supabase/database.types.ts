// Hand-authored to mirror supabase/migrations (foundation + cloud slice).
// Regenerate with `npx supabase gen types typescript --linked` once logged in
// (`--db-url` gen requires a local Docker daemon, which this machine lacks).

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      activity_log: {
        Row: {
          id: string;
          group_id: string;
          actor_member: string;
          action: string;
          note: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          actor_member: string;
          action: string;
          note?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          actor_member?: string;
          action?: string;
          note?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activity_log_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activity_log_actor_member_fkey";
            columns: ["actor_member"];
            isOneToOne: false;
            referencedRelation: "group_members";
            referencedColumns: ["id"];
          },
        ];
      };
      group_members: {
        Row: {
          id: string;
          group_id: string;
          auth_uid: string | null;
          display_name: string;
          email: string;
          is_coordinator: boolean;
          role: string;
          color_key: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          auth_uid?: string | null;
          display_name: string;
          email?: string;
          is_coordinator?: boolean;
          role?: string;
          color_key?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          auth_uid?: string | null;
          display_name?: string;
          email?: string;
          is_coordinator?: boolean;
          role?: string;
          color_key?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
        ];
      };
      groups: {
        Row: {
          id: string;
          project_id: string;
          name: string;
          join_code: string;
          created_by_member: string | null;
          strengths: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          name: string;
          join_code?: string;
          created_by_member?: string | null;
          strengths?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          name?: string;
          join_code?: string;
          created_by_member?: string | null;
          strengths?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "groups_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "groups_created_by_member_fkey";
            columns: ["created_by_member"];
            isOneToOne: false;
            referencedRelation: "group_members";
            referencedColumns: ["id"];
          },
        ];
      };
      peer_evaluations: {
        Row: {
          id: string;
          project_id: string;
          group_id: string;
          rater_member: string;
          ratee_member: string;
          score: number;
          comment: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          group_id: string;
          rater_member: string;
          ratee_member: string;
          score: number;
          comment?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          group_id?: string;
          rater_member?: string;
          ratee_member?: string;
          score?: number;
          comment?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "peer_evaluations_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "peer_evaluations_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "peer_evaluations_rater_member_fkey";
            columns: ["rater_member"];
            isOneToOne: false;
            referencedRelation: "group_members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "peer_evaluations_ratee_member_fkey";
            columns: ["ratee_member"];
            isOneToOne: false;
            referencedRelation: "group_members";
            referencedColumns: ["id"];
          },
        ];
      };
      projects: {
        Row: {
          id: string;
          template_id: string | null;
          teacher_id: string;
          title: string;
          description: string;
          join_code: string;
          status: Database["public"]["Enums"]["project_status"];
          start_date: string | null;
          due_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          template_id?: string | null;
          teacher_id: string;
          title: string;
          description?: string;
          join_code?: string;
          status?: Database["public"]["Enums"]["project_status"];
          start_date?: string | null;
          due_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          template_id?: string | null;
          teacher_id?: string;
          title?: string;
          description?: string;
          join_code?: string;
          status?: Database["public"]["Enums"]["project_status"];
          start_date?: string | null;
          due_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "projects_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "templates";
            referencedColumns: ["id"];
          },
        ];
      };
      reports: {
        Row: {
          id: string;
          project_id: string;
          group_id: string;
          generated_at: string;
          payload: Json;
        };
        Insert: {
          id?: string;
          project_id: string;
          group_id: string;
          generated_at?: string;
          payload: Json;
        };
        Update: {
          id?: string;
          project_id?: string;
          group_id?: string;
          generated_at?: string;
          payload?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "reports_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
        ];
      };
      tasks: {
        Row: {
          id: string;
          group_id: string;
          template_item_id: string | null;
          title: string;
          description: string;
          type: Database["public"]["Enums"]["item_type"];
          status: Database["public"]["Enums"]["task_status"];
          assignee_member: string | null;
          assignees: string[];
          checklist: Json;
          due_date: string | null;
          sort_order: number;
          done_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          template_item_id?: string | null;
          title: string;
          description?: string;
          type?: Database["public"]["Enums"]["item_type"];
          status?: Database["public"]["Enums"]["task_status"];
          assignee_member?: string | null;
          assignees?: string[];
          checklist?: Json;
          due_date?: string | null;
          sort_order?: number;
          done_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          template_item_id?: string | null;
          title?: string;
          description?: string;
          type?: Database["public"]["Enums"]["item_type"];
          status?: Database["public"]["Enums"]["task_status"];
          assignee_member?: string | null;
          assignees?: string[];
          checklist?: Json;
          due_date?: string | null;
          sort_order?: number;
          done_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_template_item_id_fkey";
            columns: ["template_item_id"];
            isOneToOne: false;
            referencedRelation: "template_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_assignee_member_fkey";
            columns: ["assignee_member"];
            isOneToOne: false;
            referencedRelation: "group_members";
            referencedColumns: ["id"];
          },
        ];
      };
      template_items: {
        Row: {
          id: string;
          template_id: string;
          type: Database["public"]["Enums"]["item_type"];
          title: string;
          sort_order: number;
        };
        Insert: {
          id?: string;
          template_id: string;
          type: Database["public"]["Enums"]["item_type"];
          title: string;
          sort_order?: number;
        };
        Update: {
          id?: string;
          template_id?: string;
          type?: Database["public"]["Enums"]["item_type"];
          title?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "template_items_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "templates";
            referencedColumns: ["id"];
          },
        ];
      };
      templates: {
        Row: {
          id: string;
          teacher_id: string;
          title: string;
          objectives: string;
          rubric: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          title: string;
          objectives?: string;
          rubric?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          teacher_id?: string;
          title?: string;
          objectives?: string;
          rubric?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      claim_member: {
        Args: { p_member_id: string };
        Returns: Json;
      };
      create_project_with_group: {
        Args: { payload: Json };
        Returns: Json;
      };
      get_project_by_code: {
        Args: { p_code: string };
        Returns: Json;
      };
    };
    Enums: {
      item_type: "task" | "milestone" | "objective";
      project_status: "active" | "in_review" | "closed";
      task_status: "todo" | "in_progress" | "done";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];

export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];

export type Enums<T extends keyof PublicSchema["Enums"]> =
  PublicSchema["Enums"][T];

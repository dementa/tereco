export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      academic_years: {
        Row: {
          created_at: string
          ends_on: string
          id: string
          is_current: boolean
          label: string
          starts_on: string
        }
        Insert: {
          created_at?: string
          ends_on: string
          id?: string
          is_current?: boolean
          label: string
          starts_on: string
        }
        Update: {
          created_at?: string
          ends_on?: string
          id?: string
          is_current?: boolean
          label?: string
          starts_on?: string
        }
        Relationships: []
      }
      assessment_submissions: {
        Row: {
          assessment_id: string
          enrollment_id: string
          id: string
          marked_at: string | null
          marked_by: string | null
          max_score: number | null
          mode: string
          started_at: string | null
          status: string
          student_id: string
          submitted_at: string
          time_spent_seconds: number
          total_score: number | null
        }
        Insert: {
          assessment_id: string
          enrollment_id: string
          id?: string
          marked_at?: string | null
          marked_by?: string | null
          max_score?: number | null
          mode?: string
          started_at?: string | null
          status?: string
          student_id: string
          submitted_at?: string
          time_spent_seconds?: number
          total_score?: number | null
        }
        Update: {
          assessment_id?: string
          enrollment_id?: string
          id?: string
          marked_at?: string | null
          marked_by?: string | null
          max_score?: number | null
          mode?: string
          started_at?: string | null
          status?: string
          student_id?: string
          submitted_at?: string
          time_spent_seconds?: number
          total_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assessment_submissions_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_submissions_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "current_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_submissions_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_submissions_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_targets: {
        Row: {
          assessment_id: string
          class_id: string | null
          created_at: string
          id: string
          level: number | null
          school_id: string | null
        }
        Insert: {
          assessment_id: string
          class_id?: string | null
          created_at?: string
          id?: string
          level?: number | null
          school_id?: string | null
        }
        Update: {
          assessment_id?: string
          class_id?: string | null
          created_at?: string
          id?: string
          level?: number | null
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assessment_targets_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_targets_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_targets_level_fkey"
            columns: ["level"]
            isOneToOne: false
            referencedRelation: "grade_levels"
            referencedColumns: ["level"]
          },
          {
            foreignKeyName: "assessment_targets_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          academic_year_id: string | null
          closes_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          id: string
          instructions: string
          opens_at: string | null
          results_released_at: string | null
          results_released_by: string | null
          status: string
          system_id: string
          term_id: string | null
          time_limit_minutes: number
          title: string
          updated_at: string
        }
        Insert: {
          academic_year_id?: string | null
          closes_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          id?: string
          instructions?: string
          opens_at?: string | null
          results_released_at?: string | null
          results_released_by?: string | null
          status?: string
          system_id: string
          term_id?: string | null
          time_limit_minutes: number
          title: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string | null
          closes_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          id?: string
          instructions?: string
          opens_at?: string | null
          results_released_at?: string | null
          results_released_by?: string | null
          status?: string
          system_id?: string
          term_id?: string | null
          time_limit_minutes?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_results_released_by_fkey"
            columns: ["results_released_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_email: string
          actor_id: string | null
          actor_name: string
          actor_role: string
          after: Json | null
          before: Json | null
          created_at: string
          entity_id: string | null
          entity_label: string
          entity_type: string
          id: number
          ip_address: string | null
          summary: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string
          actor_id?: string | null
          actor_name?: string
          actor_role?: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_label?: string
          entity_type?: string
          id?: number
          ip_address?: string | null
          summary?: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string
          actor_id?: string | null
          actor_name?: string
          actor_role?: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_label?: string
          entity_type?: string
          id?: number
          ip_address?: string | null
          summary?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          alias: string | null
          created_at: string
          created_by: string | null
          has_streams: boolean
          id: string
          is_active: boolean
          level: number | null
          school_id: string
        }
        Insert: {
          alias?: string | null
          created_at?: string
          created_by?: string | null
          has_streams?: boolean
          id?: string
          is_active?: boolean
          level?: number | null
          school_id: string
        }
        Update: {
          alias?: string | null
          created_at?: string
          created_by?: string | null
          has_streams?: boolean
          id?: string
          is_active?: boolean
          level?: number | null
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_level_fkey"
            columns: ["level"]
            isOneToOne: false
            referencedRelation: "grade_levels"
            referencedColumns: ["level"]
          },
          {
            foreignKeyName: "classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          academic_year_id: string
          class_id: string
          created_at: string
          created_by: string | null
          enrolled_on: string
          exit_reason: string | null
          exited_on: string | null
          id: string
          school_id: string
          status: string
          stream_id: string | null
          student_id: string
        }
        Insert: {
          academic_year_id: string
          class_id: string
          created_at?: string
          created_by?: string | null
          enrolled_on: string
          exit_reason?: string | null
          exited_on?: string | null
          id?: string
          school_id: string
          status?: string
          stream_id?: string | null
          student_id: string
        }
        Update: {
          academic_year_id?: string
          class_id?: string
          created_at?: string
          created_by?: string | null
          enrolled_on?: string
          exit_reason?: string | null
          exited_on?: string | null
          id?: string
          school_id?: string
          status?: string
          stream_id?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "streams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_levels: {
        Row: {
          code: string
          level: number
          name: string
        }
        Insert: {
          code: string
          level: number
          name: string
        }
        Update: {
          code?: string
          level?: number
          name?: string
        }
        Relationships: []
      }
      id_sequences: {
        Row: {
          entity_type: string
          next_value: number
          year: number
        }
        Insert: {
          entity_type: string
          next_value?: number
          year?: number
        }
        Update: {
          entity_type?: string
          next_value?: number
          year?: number
        }
        Relationships: []
      }
      lesson_reports: {
        Row: {
          absent: number
          academic_year_id: string
          achievement: string
          approach: string
          challenge_details: string
          class_id: string
          computer_access: string
          created_at: string
          had_challenges: boolean
          id: string
          learning_area: string
          lesson_date: string
          missed_explanation: string
          missed_reason: string
          overall_progress: string
          period: number
          present: number
          reference: string
          school_id: string
          specific_skill: string
          staff_id: string
          status: string
          stream_id: string | null
          support_required: string
          term_id: string | null
          updated_at: string
        }
        Insert: {
          absent?: number
          academic_year_id: string
          achievement?: string
          approach: string
          challenge_details?: string
          class_id: string
          computer_access: string
          created_at?: string
          had_challenges?: boolean
          id?: string
          learning_area: string
          lesson_date: string
          missed_explanation?: string
          missed_reason?: string
          overall_progress: string
          period: number
          present?: number
          reference?: string
          school_id: string
          specific_skill: string
          staff_id: string
          status: string
          stream_id?: string | null
          support_required?: string
          term_id?: string | null
          updated_at?: string
        }
        Update: {
          absent?: number
          academic_year_id?: string
          achievement?: string
          approach?: string
          challenge_details?: string
          class_id?: string
          computer_access?: string
          created_at?: string
          had_challenges?: boolean
          id?: string
          learning_area?: string
          lesson_date?: string
          missed_explanation?: string
          missed_reason?: string
          overall_progress?: string
          period?: number
          present?: number
          reference?: string
          school_id?: string
          specific_skill?: string
          staff_id?: string
          status?: string
          stream_id?: string | null
          support_required?: string
          term_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_reports_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_reports_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_reports_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_reports_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_reports_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "streams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_reports_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_reads: {
        Row: {
          notification_id: number
          profile_id: string
          read_at: string
        }
        Insert: {
          notification_id: number
          profile_id: string
          read_at?: string
        }
        Update: {
          notification_id?: number
          profile_id?: string
          read_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          audience_profile_id: string | null
          audience_role: string | null
          audience_school_id: string | null
          body: string
          created_at: string
          created_by: string | null
          entity_id: string | null
          entity_type: string
          id: number
          link: string | null
          title: string
          type: string
        }
        Insert: {
          audience_profile_id?: string | null
          audience_role?: string | null
          audience_school_id?: string | null
          body?: string
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: number
          link?: string | null
          title: string
          type: string
        }
        Update: {
          audience_profile_id?: string | null
          audience_role?: string | null
          audience_school_id?: string | null
          body?: string
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: number
          link?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_audience_profile_id_fkey"
            columns: ["audience_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_audience_school_id_fkey"
            columns: ["audience_school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_students: {
        Row: {
          created_at: string
          is_primary: boolean
          parent_id: string
          relationship: string | null
          student_id: string
        }
        Insert: {
          created_at?: string
          is_primary?: boolean
          parent_id: string
          relationship?: string | null
          student_id: string
        }
        Update: {
          created_at?: string
          is_primary?: boolean
          parent_id?: string
          relationship?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_students_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          contact_email: string | null
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          department: string | null
          email: string
          first_name: string
          gender: string | null
          id: string
          is_active: boolean
          last_name: string
          middle_name: string | null
          must_change_password: boolean
          phone_primary: string | null
          phone_secondary: string | null
          photo_public_id: string | null
          photo_url: string | null
          role: string
          school_id: string | null
          system_id: string | null
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          department?: string | null
          email: string
          first_name?: string
          gender?: string | null
          id: string
          is_active?: boolean
          last_name?: string
          middle_name?: string | null
          must_change_password?: boolean
          phone_primary?: string | null
          phone_secondary?: string | null
          photo_public_id?: string | null
          photo_url?: string | null
          role: string
          school_id?: string | null
          system_id?: string | null
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          department?: string | null
          email?: string
          first_name?: string
          gender?: string | null
          id?: string
          is_active?: boolean
          last_name?: string
          middle_name?: string | null
          must_change_password?: boolean
          phone_primary?: string | null
          phone_secondary?: string | null
          photo_public_id?: string | null
          photo_url?: string | null
          role?: string
          school_id?: string | null
          system_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          assessment_id: string
          code: string
          config: Json | null
          correct_answer: string | null
          created_at: string
          id: string
          image_public_id: string | null
          image_url: string | null
          max_score: number
          model_answer: string | null
          options: Json
          position: number
          question_text: string
          type: string
        }
        Insert: {
          assessment_id: string
          code: string
          config?: Json | null
          correct_answer?: string | null
          created_at?: string
          id?: string
          image_public_id?: string | null
          image_url?: string | null
          max_score?: number
          model_answer?: string | null
          options?: Json
          position: number
          question_text: string
          type: string
        }
        Update: {
          assessment_id?: string
          code?: string
          config?: Json | null
          correct_answer?: string | null
          created_at?: string
          id?: string
          image_public_id?: string | null
          image_url?: string | null
          max_score?: number
          model_answer?: string | null
          options?: Json
          position?: number
          question_text?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      responses: {
        Row: {
          answer: string
          created_at: string
          id: string
          is_auto_scored: boolean
          marked_at: string | null
          marked_by: string | null
          question_id: string
          score: number | null
          submission_id: string
        }
        Insert: {
          answer?: string
          created_at?: string
          id?: string
          is_auto_scored?: boolean
          marked_at?: string | null
          marked_by?: string | null
          question_id: string
          score?: number | null
          submission_id: string
        }
        Update: {
          answer?: string
          created_at?: string
          id?: string
          is_auto_scored?: boolean
          marked_at?: string | null
          marked_by?: string | null
          question_id?: string
          score?: number | null
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "responses_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responses_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "assessment_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          contact_profile_id: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_active: boolean
          joined_on: string | null
          location: string
          logo_public_id: string | null
          logo_url: string | null
          name: string
          phone: string
          system_id: string
        }
        Insert: {
          contact_profile_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          joined_on?: string | null
          location?: string
          logo_public_id?: string | null
          logo_url?: string | null
          name: string
          phone?: string
          system_id: string
        }
        Update: {
          contact_profile_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          joined_on?: string | null
          location?: string
          logo_public_id?: string | null
          logo_url?: string | null
          name?: string
          phone?: string
          system_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schools_contact_profile_id_fkey"
            columns: ["contact_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schools_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_assignments: {
        Row: {
          academic_year_id: string
          class_id: string | null
          created_at: string
          created_by: string | null
          id: string
          is_class_teacher: boolean
          learning_area: string | null
          school_id: string
          staff_id: string
          stream_id: string | null
        }
        Insert: {
          academic_year_id: string
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_class_teacher?: boolean
          learning_area?: string | null
          school_id: string
          staff_id: string
          stream_id?: string | null
        }
        Update: {
          academic_year_id?: string
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_class_teacher?: boolean
          learning_area?: string | null
          school_id?: string
          staff_id?: string
          stream_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_assignments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_assignments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_assignments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_assignments_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "streams"
            referencedColumns: ["id"]
          },
        ]
      }
      streams: {
        Row: {
          class_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          class_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          class_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "streams_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "streams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_scans: {
        Row: {
          id: string
          page_number: number
          public_id: string
          submission_id: string
          uploaded_at: string
          url: string
        }
        Insert: {
          id?: string
          page_number: number
          public_id: string
          submission_id: string
          uploaded_at?: string
          url: string
        }
        Update: {
          id?: string
          page_number?: number
          public_id?: string
          submission_id?: string
          uploaded_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_scans_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "assessment_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      terms: {
        Row: {
          academic_year_id: string
          created_at: string
          ends_on: string
          id: string
          name: string
          number: number
          school_id: string
          starts_on: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          ends_on: string
          id?: string
          name?: string
          number: number
          school_id: string
          starts_on: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          ends_on?: string
          id?: string
          name?: string
          number?: number
          school_id?: string
          starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "terms_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terms_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      current_enrollments: {
        Row: {
          academic_year_id: string | null
          class_display_name: string | null
          class_id: string | null
          created_at: string | null
          created_by: string | null
          enrolled_on: string | null
          exit_reason: string | null
          exited_on: string | null
          id: string | null
          level: number | null
          school_id: string | null
          status: string | null
          stream_id: string | null
          stream_name: string | null
          student_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classes_level_fkey"
            columns: ["level"]
            isOneToOne: false
            referencedRelation: "grade_levels"
            referencedColumns: ["level"]
          },
          {
            foreignKeyName: "enrollments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "streams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      assessment_is_fully_marked: {
        Args: { p_assessment: string }
        Returns: boolean
      }
      assessments_for_student: {
        Args: { p_student: string }
        Returns: {
          academic_year_id: string | null
          closes_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          id: string
          instructions: string
          opens_at: string | null
          results_released_at: string | null
          results_released_by: string | null
          status: string
          system_id: string
          term_id: string | null
          time_limit_minutes: number
          title: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "assessments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      correct_answer_is_valid: {
        Args: { p_correct: string; p_options: Json; p_type: string }
        Returns: boolean
      }
      generate_system_id: { Args: { p_entity_type: string }; Returns: string }
      notifications_for_profile: {
        Args: { p_profile: string }
        Returns: {
          body: string
          created_at: string
          entity_id: string
          entity_type: string
          id: number
          is_read: boolean
          link: string
          title: string
          type: string
        }[]
      }
      set_current_academic_year: {
        Args: { p_year_id: string }
        Returns: undefined
      }
      term_for_date: {
        Args: { p_date: string; p_school_id: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const


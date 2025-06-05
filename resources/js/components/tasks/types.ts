export type TaskWeighing = {
  statuse_weighing_name: string;
  weight: number;
  updated_at: string;
};

export type TaskLoading = {
  warehouse_name: string;
  warehouse_gate_plan_name: string;
  warehouse_gate_fact_name: string;
};

export type Task = {
  id: number;
  name: string;
  status_name: string;
  plan_date: string;
  begin_date: string;
  end_date: string;
  description: string;
  yard_name: string;
  avtor: string;
  phone?: string;
  company?: string;
  truck_plate_number: string;
  trailer_plate_number?: string;
  truck_model?: string;
  truck_category_name?: string;
  trailer_type_name?: string;
  truck_model_name?: string;
  color?: string;
  user_name: string;
  user_login: string;
  user_phone: string;

  task_weighings: TaskWeighing[];
  task_loadings: TaskLoading[];
};

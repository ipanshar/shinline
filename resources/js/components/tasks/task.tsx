import React from "react";
import { Modal, Table, Pagination, Container, Row, Col, Dropdown, Card, Form } from "react-bootstrap";
import { Button } from "@/components/ui/button";
import { Edit as EditIcon, Save as SaveIcon, Close as CancelIcon } from '@mui/icons-material';
import { DataGrid, GridToolbarContainer, GridToolbarExport, GridRowModes, GridActionsCellItem, } from "@mui/x-data-grid";
import { ruRU } from '@mui/x-data-grid/locales';
import Select from "react-select";

import axios from "axios";

interface TascksProps {
    // Define the expected props here, e.g., exampleProp?: string;
}

interface TascksState {
    tasks: any[];
    paginate: any[];
    view_app: any[];
    main_cont: boolean;
    selectedTask: any | null;
    showModal: boolean;
    isEditMode: boolean;
    newTaskName: string;
    newTaskDescription: string;
    newTaskStatus: string;
    newTaskPriority: string;
    newTaskAssignee: string;
    newTaskDueDate: string;
}

export class Tascks extends React.Component<TascksProps, TascksState> {
    constructor(props: TascksProps) {
        super(props);
        this.state = {
            tasks: [],
            paginate: [],
            view_app: [],
            main_cont: true,
            selectedTask: null,
            showModal: false,
            isEditMode: false,
            newTaskName: "",
            newTaskDescription: "",
            newTaskStatus: "",
            newTaskPriority: "",
            newTaskAssignee: "",
            newTaskDueDate: "",
        };
    }
    componentDidMount() {
        this.Gettasks(1);


    }

    Gettasks = (page: number) => {
        axios.post('/task/gettasks', { page: page }).then((response) => {

            this.state.view_app.length = 0;
            this.state.paginate.length = 0;
            const paginateArr: any[] = [];
            if (response.data.current_page > 0) {
                const current_page = Number(response.data.current_page);
                const last_page = Number(response.data.last_page);
                if (this.state.paginate.length === 0) {
                    paginateArr.push(<Button key={current_page * 20} className="paginateButton ms-1" size="sm" onClick={() => this.Gettasks(1)} >&laquo;</Button>);
                    if ((current_page - 2) > 0) { paginateArr.push(<Button key={current_page - 2} className="paginateButton ms-1" size="sm" onClick={() => this.Gettasks(current_page - 2)} >{current_page - 2}</Button>,) }
                    if ((current_page - 1) > 0) { paginateArr.push(<Button key={current_page - 1} className="paginateButton ms-1" size="sm" onClick={() => this.Gettasks(current_page - 1)} >{current_page - 1}</Button>,) }
                    paginateArr.push(<Button key={current_page} disabled size="sm" className="paginateButton ms-1" >{current_page}</Button>,);
                    if ((current_page + 1) <= last_page) { paginateArr.push(<Button key={current_page + 1} className="paginateButton ms-1" size="sm" onClick={() => this.Gettasks(current_page + 1)}  >{current_page + 1}</Button>,) }
                    if ((current_page + 2) <= last_page) { paginateArr.push(<Button key={current_page + 2} className="paginateButton ms-1" size="sm" onClick={() => this.Gettasks(current_page + 2)} >{current_page + 2}</Button>,) }
                    paginateArr.push(<Button key={current_page * 10} className="paginateButton ms-1" size="sm" onClick={() => this.Gettasks(last_page)} >&raquo;</Button>);
                }
            }
            this.setState({ paginate: paginateArr });
            this.setState({ tasks: response.data.data, main_cont: false }, () => {
                this.view_app();
            });

        }).catch((error) => {
            console.error('Ошибка при получении задания:', error);
        });

    }

    view_app = () => {
        if (this.state.tasks.length > 0) {
            const updatedViewApp = this.state.tasks.map((task, index) => (
                <div key={index} className="border border-dark rounded m-1 p-2 bg-white shadow-md">
                    <table className="table table-bordered table-striped table-hover w-full">
                        <thead className="bg-red-500 text-white w-full">
                            <tr>
                                <th className="w-1/3 d-flex justify-content-start">ID: {task.id}</th>
                                <th className="w-1/3">Рейс: {task.name}</th>
                                <th className="w-1/3">Статус: {task.status_name}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="d-flex justify-content-start"><small>План: {task.plan_date}</small></td>
                                <td className="d-flex justify-content-start"><small>Прибытие: {task.begin_date}</small></td>
                                <td className="d-flex justify-content-start"><small>Убытие: {task.end_date}</small></td>
                            </tr>
                            <tr>
                                <td colSpan={3} className="d-flex justify-content-start"><small >{task.description}</small></td>
                            </tr>
                            <tr>
                                <td colSpan={3} className="d-flex justify-content-start"><small >{task.yard_name}</small></td>
                            </tr>
                            <tr>
                                <td colSpan={3} className="d-flex justify-content-start">
                                    <small>
                                        Кординатор:{task.avtor};{task.phone ? " тел: " + task.phone : ""}
                                    </small></td>
                            </tr>
                            <tr>
                                <td colSpan={3} >
                                    <span className="d-flex justify-content-start"><small> {task.company ? "Компания: " + task.company + "; " : ""} Номер ТС: <b>{task.truck_plate_number}</b>;
                                        {task.trailer_plate_number ? "Номер прицепа: " + task.trailer_plate_number + "; " : ""}
                                        {task.truck_model ? "Модель ТС: " + task.truck_model + "; " : ""}
                                        {task.truck_category_name ? "Категория ТС: " + task.truck_category_name + "; " : ""}
                                        {task.trailer_type_name ? "Тип прицепа: " + task.trailer_type_name + "; " : ""}
                                        {task.truck_model_name ? "Модель прицепа: " + task.truck_model_name + "; " : ""}
                                        {task.color ? "Цвет: " + task.color + ";" : ""}
                                    </small></span></td>
                            </tr>
                            <tr>
                                <td colSpan={3} className="d-flex justify-content-start"><small>Водитель: {task.user_name};
                                    login: {task.user_login}; тел: {task.user_phone};</small></td>
                            </tr>
                            <tr>
                                <td colSpan={3} className="text-center"><small><b>Задачи</b></small></td>
                            </tr>
                            {task.task_weighings.length > 0 ?
                                <tr className="d-flex justify-content-start border-t-2 border-b-gray-300  bg-green-200">
                                    <td className="d-flex justify-content-start"><small>{task.task_weighings[0].statuse_weighing_name}</small></td>
                                    <td className="d-flex justify-content-start"><small>вес: <b>{task.task_weighings[0].weight}</b></small></td>
                                    <td className="d-flex justify-content-start"><small>{task.task_weighings[0].weight ? task.task_weighings[0].updated_at : ''}</small></td>
                                </tr> : ''}
                            {task.task_loadings.length > 0 ? task.task_loadings.map((task_loading: any, index: number) => (
                                <tr key={index} className="d-flex justify-content-start border-t-2 border-b-gray-300  bg-yellow-200">
                                    <td className="d-flex justify-content-start"><small>{task_loading.warehouse_name}</small></td>
                                    <td className="d-flex justify-content-start"><small>Ворота план: <b>{task_loading.warehouse_gate_plan_name}</b></small></td>
                                    <td className="d-flex justify-content-start"><small>Ворота факт: <b>{task_loading.warehouse_gate_fact_name}</b></small></td>
                                </tr>
                            )) : ''}
                            {task.task_weighings.length > 0 ?
                                <tr className="d-flex justify-content-start border-t-2 border-b-gray-300 bg-green-200">
                                    <td className="d-flex justify-content-start"><small>{task.task_weighings[1].statuse_weighing_name}</small></td>
                                    <td className="d-flex justify-content-start"><small>вес: <b>{task.task_weighings[1].weight}</b></small></td>
                                    <td className="d-flex justify-content-start"><small>{task.task_weighings[1].weight ? task.task_weighings[1].updated_at : ''}</small></td>
                                </tr> : ''}
                        </tbody>
                        <tfoot className="bg-red-500 text-white w-full">

                        </tfoot>
                    </table>
                </div>)
            )

            this.setState({ view_app: updatedViewApp });
        }
    }

    render() {
        return (
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">

                <div className="grid auto-rows-min gap-4 md:grid-cols-3">
                    {this.state.view_app.map((item, index) => (item))}
                </div>
                <div key="pagination" className="sticky bottom-0 w-full flex justify-center p-4 rounded-xl shadow-md"> {this.state.paginate.map((item, index) => (item))}</div>

            </div>
        )
    }
}



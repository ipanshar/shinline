import React from "react";
import { Modal, Table, Pagination, Container, Row, Col, Dropdown, Card, Form } from "react-bootstrap";
import { Button } from "@/components/ui/button";
import { Edit as EditIcon, Save as SaveIcon, Close as CancelIcon } from '@mui/icons-material';
import { DataGrid, GridToolbarContainer, GridToolbarExport, GridRowModes, GridActionsCellItem, } from "@mui/x-data-grid";
import { ruRU } from '@mui/x-data-grid/locales';
import Select from "react-select";

import axios from "axios";
import TaskCard from "@/components/tasks/taskCard";

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
                <TaskCard task={task}/>)
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



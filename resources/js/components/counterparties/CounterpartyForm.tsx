import React, { useState, useEffect } from "react";
import axios from "axios";
import { TextField, Button, Box, Checkbox, FormControlLabel, Grid } from "@mui/material";
import { FileSpreadsheet } from "lucide-react";

interface Counterparty {
    id: number;
    name: string;
    inn: string;
    address: string | null;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
    supervisor: string | null;
    contact_person: string | null;
    carrier_type: boolean;
}

interface CounterpartyFormProps {
    onCounterpartyAdded: () => void;
    counterparty?: Counterparty | null;
    onCancel?: () => void;
    onImportClick?: () => void;
}

const CounterpartyForm: React.FC<CounterpartyFormProps> = ({ 
    onCounterpartyAdded, 
    counterparty,
    onCancel,
    onImportClick
}) => {
    const [formData, setFormData] = useState({
        name: "",
        inn: "",
        address: "",
        phone: "",
        whatsapp: "",
        email: "",
        supervisor: "",
        contact_person: "",
        carrier_type: false,
    });
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (counterparty) {
            setFormData({
                name: counterparty.name || "",
                inn: counterparty.inn || "",
                address: counterparty.address || "",
                phone: counterparty.phone || "",
                whatsapp: counterparty.whatsapp || "",
                email: counterparty.email || "",
                supervisor: counterparty.supervisor || "",
                contact_person: counterparty.contact_person || "",
                carrier_type: counterparty.carrier_type || false,
            });
        } else {
            setFormData({
                name: "",
                inn: "",
                address: "",
                phone: "",
                whatsapp: "",
                email: "",
                supervisor: "",
                contact_person: "",
                carrier_type: false,
            });
        }
    }, [counterparty]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === "checkbox" ? checked : value,
        }));
    };

    const handleSubmit = () => {
        if (!formData.name.trim() || !formData.inn.trim()) {
            setError("Название и ИНН обязательны!");
            return;
        }

        setLoading(true);
        setError("");

        const url = counterparty 
            ? "/counterparty/updatecounterparty" 
            : "/counterparty/addcounterparty";
        
        const data = counterparty 
            ? { ...formData, id: counterparty.id }
            : formData;

        axios.post(url, data)
            .then((response) => {
                if (response.data.status) {
                    setFormData({
                        name: "",
                        inn: "",
                        address: "",
                        phone: "",
                        whatsapp: "",
                        email: "",
                        supervisor: "",
                        contact_person: "",
                        carrier_type: false,
                    });
                    onCounterpartyAdded();
                } else {
                    setError(response.data.message);
                }
            })
            .catch((err) => {
                setError(err.response?.data?.message || "Ошибка при сохранении контрагента");
            })
            .finally(() => setLoading(false));
    };

    const handleCancelClick = () => {
        setFormData({
            name: "",
            inn: "",
            address: "",
            phone: "",
            whatsapp: "",
            email: "",
            supervisor: "",
            contact_person: "",
            carrier_type: false,
        });
        if (onCancel) {
            onCancel();
        }
    };

    return (
        <Box sx={{ maxWidth: 900, margin: "auto", padding: 3, border: "1px solid #ddd", borderRadius: 2, mb: 3 }}>
            <h2>{counterparty ? "Редактировать контрагента" : "Добавить нового контрагента"}</h2>

            {error && <p style={{ color: "red" }}>{error}</p>}

            <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                    <TextField
                        label="Название *"
                        name="name"
                        fullWidth
                        value={formData.name}
                        onChange={handleChange}
                        required
                    />
                </Grid>

                <Grid item xs={12} sm={6}>
                    <TextField
                        label="ИНН *"
                        name="inn"
                        fullWidth
                        value={formData.inn}
                        onChange={handleChange}
                        required
                    />
                </Grid>

                <Grid item xs={12}>
                    <TextField
                        label="Адрес"
                        name="address"
                        fullWidth
                        value={formData.address}
                        onChange={handleChange}
                    />
                </Grid>

                <Grid item xs={12} sm={6}>
                    <TextField
                        label="Телефон"
                        name="phone"
                        fullWidth
                        value={formData.phone}
                        onChange={handleChange}
                    />
                </Grid>

                <Grid item xs={12} sm={6}>
                    <TextField
                        label="WhatsApp"
                        name="whatsapp"
                        fullWidth
                        value={formData.whatsapp}
                        onChange={handleChange}
                    />
                </Grid>

                <Grid item xs={12}>
                    <TextField
                        label="Email"
                        name="email"
                        type="email"
                        fullWidth
                        value={formData.email}
                        onChange={handleChange}
                    />
                </Grid>

                <Grid item xs={12} sm={6}>
                    <TextField
                        label="Руководитель"
                        name="supervisor"
                        fullWidth
                        value={formData.supervisor}
                        onChange={handleChange}
                    />
                </Grid>

                <Grid item xs={12} sm={6}>
                    <TextField
                        label="Контактное лицо"
                        name="contact_person"
                        fullWidth
                        value={formData.contact_person}
                        onChange={handleChange}
                    />
                </Grid>

                <Grid item xs={12}>
                    <FormControlLabel
                        control={
                            <Checkbox
                                name="carrier_type"
                                checked={formData.carrier_type}
                                onChange={handleChange}
                            />
                        }
                        label="Международный перевозчик"
                    />
                </Grid>

                <Grid item xs={12}>
                    <Box sx={{ display: "flex", gap: 2 }}>
                        <Button 
                            variant="contained" 
                            color="primary" 
                            onClick={handleSubmit}
                            disabled={loading}
                        >
                            {loading ? "Сохранение..." : (counterparty ? "Обновить" : "Добавить")}
                        </Button>
                        {!counterparty && onImportClick && (
                            <Button
                                variant="outlined"
                                color="success"
                                startIcon={<FileSpreadsheet />}
                                onClick={onImportClick}
                            >
                                Импорт из Excel
                            </Button>
                        )}
                        {counterparty && (
                            <Button 
                                variant="outlined" 
                                onClick={handleCancelClick}
                            >
                                Отмена
                            </Button>
                        )}
                    </Box>
                </Grid>
            </Grid>
        </Box>
    );
};

export default CounterpartyForm;

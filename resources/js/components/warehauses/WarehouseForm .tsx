import React, { useState, useEffect } from "react";
import axios from "axios";
import { TextField, Button, MenuItem, Select, FormControl, InputLabel, Box } from "@mui/material";

interface WarehouseFormProps {
  onWarehouseAdded: (warehouse: { id: string; name: string }) => void;
}

const WarehouseForm: React.FC<WarehouseFormProps> = ({ onWarehouseAdded }) => {
  const [yards, setYards] = useState<{ id: string; name: string }[]>([]);
  const [yardId, setYardId] = useState("");
  const [warehouseName, setWarehouseName] = useState("");
  const [loadingYards, setLoadingYards] = useState(true);
  const [error, setError] = useState("");


  useEffect(() => {
    axios
      .post("/yard/getyards")
      .then((response) => {
        if (response.data.status) {
          setYards(response.data.data);
        } else {
          setError(response.data.message);
        }
      })
      .catch(() => setError("Ошибка загрузки дворов"))
      .finally(() => setLoadingYards(false));
  }, []);


  const handleSubmit = () => {
    if (!yardId || !warehouseName.trim()) {
      setError("Заполните все поля!");
      return;
    }

    axios
      .post("/warehouse/addwarehouse", {
        name: warehouseName,
        yard_id: yardId,
      })
      .then((response) => {
        if (response.data.status) {
          setWarehouseName("");
          setYardId("");
          onWarehouseAdded(response.data.data);
        } else {
          setError(response.data.message);
        }
      })
      .catch(() => setError("Ошибка добавления склада"));
  };

  return (
    <Box sx={{ maxWidth: 400, margin: "auto", padding: 3 }}>
      <h2>Добавить новый склад</h2>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel>Выберите двор</InputLabel>
        <Select value={yardId} onChange={(e) => setYardId(e.target.value)} disabled={loadingYards}>
          {yards.map((yard) => (
            <MenuItem key={yard.id} value={yard.id}>
              {yard.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <TextField
        label="Название склада"
        fullWidth
        value={warehouseName}
        onChange={(e) => setWarehouseName(e.target.value)}
        sx={{ mb: 2 }}
      />

      <Button variant="contained" color="primary" fullWidth onClick={handleSubmit}>
         Добавить склад
      </Button>
    </Box>
  );
};

export default WarehouseForm;
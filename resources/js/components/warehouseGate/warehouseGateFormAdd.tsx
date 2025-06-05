import React, { useState, useEffect } from "react";
import axios from "axios";
import { TextField, Button, MenuItem, Select, FormControl, InputLabel, Box } from "@mui/material";

interface WarehouseFormProps {
  onChange: (id: string) => void;
}

const WarehouseForm: React.FC<WarehouseFormProps> = ({ onChange }) => {
  const [warehouse, setWarehouse] = useState<{ id: string; name: string }[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [gateName, setGateName] = useState("");
  const [loadingWarehouse, setLoadingWarehouse] = useState(true);
  const [error, setError] = useState("");


  useEffect(() => {
    axios
      .post("/warehouse/getwarehouses")
      .then((response) => {
        if (response.data.status) {
          setWarehouse(response.data.data);
        } else {
          setError(response.data.message);
        }
      })
      .catch(() => setError("Ошибка загрузки складов"))
      .finally(() => setLoadingWarehouse(false));
  }, []);


  const handleSubmit = () => {
    if (!warehouseId || !gateName.trim()) {
      setError("Заполните все поля!");
      return;
    }

    axios
      .post("/warehouse/addgate", {
        name: gateName,
        warehouse_id: warehouseId,
      })
      .then((response) => {
        if (response.data.status) {
          setGateName("");
          onChange(warehouseId);
        } else {
          setError(response.data.message);
        }
      })
      .catch(() => setError("Ошибка добавления вороты"));
  };

  return (
    <Box sx={{ maxWidth: 400, margin: "auto", padding: 3 }}>
      <h2>Загрузить ворота</h2>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <FormControl fullWidth sx={{ mb: 3 }}>
        <InputLabel >Выберите склад</InputLabel>
        <Select value={warehouseId} onChange={(e) => {setWarehouseId(e.target.value); onChange(e.target.value)}} disabled={loadingWarehouse}>
          {warehouse.map((val) => (
            <MenuItem key={val.id} value={val.id}>
              {val.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <TextField
        label="Название вороты"
        fullWidth
        value={gateName}
        onChange={(e) => setGateName(e.target.value)}
        sx={{ mb: 2 }}
      />

      <Button variant="contained" color="warning" fullWidth onClick={handleSubmit}>
         Добавить ворота
      </Button>
    </Box>
  );
};

export default WarehouseForm;
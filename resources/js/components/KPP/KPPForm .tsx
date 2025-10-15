import React, { useState, useEffect } from "react";
import axios from "axios";
import { TextField, Button, MenuItem, Select, FormControl, InputLabel, Box } from "@mui/material";

interface KPPProps {
  onChange: (id: string) => void;
}

const KPPForm: React.FC<KPPProps> = ({ onChange }) => {
  const [yard, setYard] = useState<{ id: string; name: string }[]>([]);
  const [yard_id, setYardId] = useState("");
  const [kppName, setKppName] = useState("");
  const [loadingYard, setLoadingYard] = useState(true);
  const [error, setError] = useState("");


  useEffect(() => {
    axios
      .post("/yard/getyards")
      .then((response) => {
        if (response.data.status) {
          setYard(response.data.data);
        } else {
          setError(response.data.message);
        }
      })
      .catch(() => setError("Ошибка загрузки дворов"))
      .finally(() => setLoadingYard(false));
  }, []);


  const handleSubmit = () => {
    if (!yard_id || !kppName.trim()) {
      setError("Заполните все поля!");
      return;
    }

    axios
      .post("/entrance-permit/addcheckpoint", {
        name: kppName,
        yard_id: yard_id,
      })
      .then((response) => {
        if (response.data.status) {
          setKppName("");
          onChange(yard_id);
        } else {
          setError(response.data.message);
        }
      })
      .catch(() => setError("Ошибка добавления КПП"));
  };

  return (
    <Box sx={{ maxWidth: 400, margin: "auto", padding: 3 }}>
      <h2>Загрузить КПП</h2>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <FormControl fullWidth sx={{ mb: 3 }}>
        <InputLabel >Выберите двор</InputLabel>
        <Select value={yard_id} onChange={(e) => {setYardId(e.target.value); onChange(e.target.value)}} disabled={loadingYard}>
          {yard.map((val) => (
            <MenuItem key={val.id} value={val.id}>
              {val.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <TextField
        label="Название КПП"
        fullWidth
        value={kppName}
        onChange={(e) => setKppName(e.target.value)}
        sx={{ mb: 2 }}
      />

      <Button variant="contained" color="secondary" fullWidth onClick={handleSubmit}>
         Добавить КПП
      </Button>
    </Box>
  );
};

export default KPPForm;
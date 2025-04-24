
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { addVehicle } from "@/lib/api";
import { toast } from "sonner";
import axios from 'axios';



interface AddVehicleFormData {
  plate_number: string;
  truck_model_name: string;
  allowed: boolean;
}

interface AddVehicleDialogProps {
  onVehicleAdded: () => void;
}

const AddVehicleDialog = ({ onVehicleAdded }: AddVehicleDialogProps) => {
  const [open, setOpen] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<AddVehicleFormData>();

  const onSubmit = async (data: AddVehicleFormData) => {
    // try {
    //   await addVehicle(data);
    //   toast.success("Машина добавлена");
    //   setOpen(false);
    //   reset();
    //   onVehicleAdded();
    //   // eslint-disable-next-line @typescript-eslint/no-unused-vars
      
    // } catch (error) {
    //   toast.error("Ошибка при добавлении машины");
    // }
    const response = await axios.post('/security/addvisitor', {
      plate_number: data.plate_number,
      truck_model_name: data.truck_model_name,}).then((response) => {
        if (response.data.status === true) {
          toast.success("Машина добавлена");
          setOpen(false);
          reset();
          onVehicleAdded();
        } else {
          toast.error("Ошибка при добавлении машины");
        }
      }).catch((error) => {
        console.error(error);
        toast.error("Ошибка при добавлении машины");
      });
      
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="mb-4">
          <Plus className="mr-2" />
          Добавить машину
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Добавить новую машину</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="plate_number">Номер машины</Label>
            <Input
              id="plate_number"
              placeholder="Например: 439AWP02"
              {...register("plate_number", {
                required: "Обязательное поле",
                pattern: {
                  value: /^\d{3}[A-Z]{3}\d{2}$/,
                  message: "Формат: 3 цифры, 3 заглавные буквы, 2 цифры"
                }
              })}
            />
            {errors.plate_number && (
              <p className="text-sm text-destructive mt-1">{errors.plate_number.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="truck_model_name">Модель</Label>
            <Input
              id="truck_model_name"
              placeholder="Например: Toyota Camry"
              {...register("truck_model_name")}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="allowed"
              {...register("allowed")}
              className="h-4 w-4"
            />
            <Label htmlFor="allowed">Разрешен въезд</Label>
          </div>

          <Button type="submit" className="w-full">
            Добавить
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddVehicleDialog;


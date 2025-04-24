
import { useState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";

interface VehicleSearchProps {
  onSearch: (pattern: string) => void;
  isLoading: boolean;
}

const VehicleSearch = ({ onSearch, isLoading }: VehicleSearchProps) => {
  const [input, setInput] = useState<string>("");
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Validate input to only allow digits
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Only allow digits, max 3
    if (/^\d{0,3}$/.test(value)) {
      setInput(value);
      
      // Clear previous debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      
      // Set new debounce timer if we have exactly 3 digits
      if (value.length === 3) {
        debounceTimerRef.current = setTimeout(() => {
          onSearch(value);
        }, 300);
      }
    }
  };

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return (
    <div className="w-full max-w-md mx-auto mb-6">
      <label htmlFor="license-search" className="block text-sm font-medium mb-2">
        Поиск по номеру (введите 3 цифры)
      </label>
      <div className="relative">
        <Input
          id="license-search"
          type="text"
          value={input}
          onChange={handleInputChange}
          className="w-full px-4 py-2 border rounded"
          placeholder="123"
          pattern="\d{3}"
          inputMode="numeric"
          required
          disabled={isLoading}
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        )}
      </div>
      {input.length > 0 && input.length < 3 && (
        <p className="text-sm text-muted-foreground mt-1">
          Введите ещё {3 - input.length} цифр(ы)
        </p>
      )}
    </div>
  );
};

export default VehicleSearch;

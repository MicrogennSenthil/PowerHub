import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Property } from '@workspace/api-client-react';

interface PropertyContextType {
  selectedPropertyId: number | null;
  setSelectedPropertyId: (id: number | null) => void;
  selectedProperty: Property | null;
}

const PropertyContext = createContext<PropertyContextType | undefined>(undefined);

export function PropertyProvider({
  children,
  properties
}: {
  children: ReactNode;
  properties: Property[];
}) {
  const [selectedPropertyId, setSelectedPropertyIdState] = useState<number | null>(() => {
    const stored = localStorage.getItem('powerhub_selected_property');
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (properties.some(p => p.id === parsed)) return parsed;
    }
    return properties.length > 0 ? properties[0].id : null;
  });

  const setSelectedPropertyId = (id: number | null) => {
    setSelectedPropertyIdState(id);
    if (id) {
      localStorage.setItem('powerhub_selected_property', id.toString());
    } else {
      localStorage.removeItem('powerhub_selected_property');
    }
  };

  // Sync if properties change and selected doesn't exist anymore
  useEffect(() => {
    if (properties.length > 0 && (!selectedPropertyId || !properties.some(p => p.id === selectedPropertyId))) {
      setSelectedPropertyId(properties[0].id);
    } else if (properties.length === 0) {
      setSelectedPropertyId(null);
    }
  }, [properties, selectedPropertyId]);

  const selectedProperty = properties.find(p => p.id === selectedPropertyId) || null;

  return (
    <PropertyContext.Provider value={{ selectedPropertyId, setSelectedPropertyId, selectedProperty }}>
      {children}
    </PropertyContext.Provider>
  );
}

export function useProperty() {
  const context = useContext(PropertyContext);
  if (context === undefined) {
    throw new Error('useProperty must be used within a PropertyProvider');
  }
  return context;
}

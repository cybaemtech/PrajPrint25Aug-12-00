import React, { createContext, useContext, useState, ReactNode } from "react";

interface CurrentUser {
  id: string;
  employee_id: string;
  name: string;
  branch: string;
  role: 'admin' | 'employee';
  department: string;
}

interface RoleContextType {
  role: 'admin' | 'employee';
  setRole: (role: 'admin' | 'employee') => void;
  currentUser: CurrentUser | null;
  setCurrentUser: (user: CurrentUser | null) => void;
  currentUserId: string;
  currentBranch: string;
}

const RoleContext = createContext<RoleContextType>({ 
  role: "employee", 
  setRole: () => {}, 
  currentUser: null,
  setCurrentUser: () => {},
  currentUserId: "", 
  currentBranch: ""
});

export const RoleProvider = ({ children }: { children: ReactNode }) => {
  const [role, setRole] = useState<'admin' | 'employee'>("employee");
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  
  const currentUserId = currentUser?.id || "u1";
  const currentBranch = currentUser?.branch || "Hinjewadi";
  
  return (
    <RoleContext.Provider value={{ role, setRole, currentUser, setCurrentUser, currentUserId, currentBranch }}>
      {children}
    </RoleContext.Provider>
  );
};

export const useRole = () => useContext(RoleContext);

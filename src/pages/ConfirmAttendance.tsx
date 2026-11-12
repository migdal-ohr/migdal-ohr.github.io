import { Navigate, useSearchParams } from "react-router-dom";

/** v1 links (/confirm-attendance?studentId=…) are retired — forward to the RSVP page which explains. */
const ConfirmAttendance = () => {
  const [params] = useSearchParams();
  return <Navigate to={`/rsvp?${params.toString()}`} replace />;
};

export default ConfirmAttendance;

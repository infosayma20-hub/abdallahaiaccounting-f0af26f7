import BirthdayCelebration from "@/components/employee/BirthdayCelebration";

export default function BirthdayPreview() {
  const today = new Date();
  const dob = `1996-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return (
    <BirthdayCelebration employeeId="preview" employeeName="محمود البيطار" dateOfBirth={dob} companyName="الملكي" />
  );
}

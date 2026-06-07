
Files to refer:
1. Docs/queue-management-plan.md

please proceed with the implementation along with the following inputs:

1. OP/IP driver: assume that now it is always OP. Also the token services should be unique for (day, OP, and Doctor)
2. /queue response shape: paginated envelope - queue should be paginated based on the day, OP and doctor name (data should come from API not Mockdata )
3. Doctor-staff mapping screen permission: Administrator-only permission
4. special_category codes/labels: VIP / SENIOR_CITIZEN / EMERGENCY is fine for now. However should be able to configure via backedn or Admin screen later (master data).
5. visits.status should be followed so that once the consultation is completed, that specific patient should be moved to 2nd tab (API can be refreshed say every 30 sec - configurable)





# ArogyaM Patient Management System

## Phase 1 – Detailed Use Case Document

### 1. Document Purpose

This document defines the Phase 1 use cases for the proposed ArogyaM Patient Management System. The objective of Phase 1 is to build a secure, web-based system for managing care seeker registration, OP number generation, patient profile management, consultation records, treatment history, prescriptions, discharge summaries, scanned document uploads, search, role-based access, audit trail, backup, and basic dashboard/reporting.

Phase 1 will focus on the internal operational needs of ArogyaM staff and doctors. Online public registration, advanced appointment workflow, SMS/WhatsApp reminders, advanced analytics, and ABDM integration may be considered in later phases.

---

# 2. Phase 1 Scope

## 2.1 In Scope

Phase 1 shall include the following functional areas:

1. User login and secure access
2. Role-based access control
3. Patient/care seeker registration
4. Automatic OP number generation
5. Patient search by OP number, mobile number, and name
6. Patient profile management
7. Visit and consultation history
8. Online consultation case sheet entry
9. Doctor consultation notes
10. Prescription record creation and upload
11. Discharge summary record creation and upload
12. Medical document upload and storage
13. Scanned old case sheet upload and linking
14. Manual entry of historical records from 2022 onward
15. Duplicate patient identification and controlled merge
16. Follow-up record tracking for staff
17. Basic dashboard
18. Basic reports/export
19. Audit trail
20. Data backup and recovery support
21. Multi-user concurrent access with data consistency

---

## 2.2 Out of Scope for Phase 1

The following are recommended for future phases:

1. Public online registration from website
2. Public appointment booking
3. Patient login/care seeker portal
4. SMS/WhatsApp reminders
5. Payment collection
6. Full ABDM/ABHA integration
7. AI-based OCR extraction
8. Advanced analytics
9. Mobile application
10. Teleconsultation video integration
11. Pharmacy/inventory management
12. Laboratory integration

---

# 3. Primary Actors

## 3.1 Administrator

Responsible for system configuration, user management, master data management, access control, audit review, backup monitoring, and high-level reporting.

## 3.2 Doctor

Responsible for viewing patient history, recording consultation notes, preparing prescriptions, creating treatment plans, entering diagnosis, and reviewing follow-ups.

## 3.3 Receptionist / Front Office Staff

Responsible for registering patients, searching records, creating visits, updating demographic information, uploading documents, and coordinating follow-ups.

## 3.4 Medical Records Staff / Data Entry Staff

Responsible for digitizing old case sheets, uploading scanned files, entering historical records, linking documents to patient profiles, and ensuring record completeness.

## 3.5 System

Responsible for generating OP numbers, enforcing access rules, maintaining audit trail, preventing conflicts, managing backup triggers, and validating data.

---

# 4. Role and Permission Matrix

| Function                      | Administrator |   Doctor | Receptionist | Records/Data Entry Staff |
| ----------------------------- | ------------: | -------: | -----------: | -----------------------: |
| Login                         |           Yes |      Yes |          Yes |                      Yes |
| Create patient                |           Yes | Optional |          Yes |                      Yes |
| Edit patient demographics     |           Yes |  Limited |          Yes |                  Limited |
| View patient profile          |           Yes |      Yes |          Yes |                      Yes |
| View complete medical history |           Yes |      Yes |      Limited |                  Limited |
| Add consultation notes        |      Optional |      Yes |           No |                       No |
| Add prescription              |      Optional |      Yes |           No |                       No |
| Upload documents              |           Yes |      Yes |          Yes |                      Yes |
| Create discharge summary      |           Yes |      Yes |           No |                  Limited |
| Merge duplicate records       |           Yes |       No | Request only |             Request only |
| Export records                |           Yes |  Limited |      Limited |                  Limited |
| Manage users                  |           Yes |       No |           No |                       No |
| View audit trail              |           Yes |       No |           No |                       No |
| Dashboard                     |           Yes |      Yes |          Yes |                  Limited |
| Backup/recovery control       |           Yes |       No |           No |                       No |

---

# 5. High-Level Functional Modules

## 5.1 User and Access Management

This module manages internal users, login security, role assignment, password management, and access restrictions.

## 5.2 Patient Registration and Profile Management

This module captures care seeker demographic details, contact details, personal information, medical background, dietary preference, health indicators, and other profile-level information.

## 5.3 OP Number Management

This module generates unique OP numbers based on consultation category such as regular consultation, village consultation, or free camp consultation.

## 5.4 Search and Retrieval

This module enables staff to quickly locate patient records using OP number, mobile number, name, or partial search keywords.

## 5.5 Visit and Consultation Management

This module records each patient visit or online consultation as a separate encounter linked to the patient profile.

## 5.6 Medical Record Management

This module stores consultation notes, diagnosis, treatment details, prescriptions, discharge summaries, scanned case sheets, reports, photographs, and other medical documents.

## 5.7 Follow-Up Tracking

This module tracks upcoming review dates, pending follow-ups, and staff action items.

## 5.8 Dashboard and Reports

This module provides limited Phase 1 dashboards such as recent registrations, pending follow-ups, and patient count by consultation category.

## 5.9 Audit and Security

This module records who created, viewed, updated, exported, or merged a patient record and when.

## 5.10 Backup and Recovery

This module ensures patient data and uploaded documents are protected against accidental loss.

---

# 6. Detailed Use Cases

---

## UC-01: User Login

### Objective

Allow authorized staff to securely log in to the Patient Management System.

### Primary Actor

Administrator, Doctor, Receptionist, Data Entry Staff

### Preconditions

User account must be created and active.

### Trigger

User opens the PMS login page.

### Main Flow

1. User enters username/email and password.
2. System validates the credentials.
3. System checks whether the user account is active.
4. System identifies the assigned role.
5. System creates a secure session.
6. User is redirected to the relevant dashboard based on role.

### Alternate Flow

If the password is incorrect, the system displays an error message without revealing whether the username exists.

### Exception Flow

If the account is disabled, the system blocks login and asks the user to contact the administrator.

### Business Rules

1. Only active users can log in.
2. Passwords must not be stored in plain text.
3. Sessions must expire after a defined period of inactivity.
4. Login attempts must be recorded in audit logs.

### Output

Authenticated user session.

### Priority

High

---

## UC-02: Manage Users and Roles

### Objective

Allow the Administrator to create and manage system users and assign appropriate roles.

### Primary Actor

Administrator

### Preconditions

Administrator must be logged in.

### Trigger

Administrator opens the User Management screen.

### Main Flow

1. Administrator selects “Create User.”
2. Administrator enters user name, email/mobile, role, and status.
3. System validates mandatory fields.
4. System checks duplicate username/email.
5. System creates the user account.
6. System assigns role-based permissions.
7. System records the action in audit trail.

### Alternate Flow

Administrator edits user role, disables user, or resets password.

### Business Rules

1. Only Administrators can manage users.
2. One user may have one or more roles depending on policy.
3. Disabled users cannot log in.
4. Role changes must be audited.

### Output

User account created or updated.

### Priority

High

---

## UC-03: Register New Patient / Care Seeker

### Objective

Create a new care seeker profile and generate a unique OP number.

### Primary Actor

Receptionist / Administrator / Data Entry Staff

### Preconditions

User must be logged in and must have patient registration permission.

### Trigger

A new care seeker visits ArogyaM or contacts the center for consultation.

### Main Flow

1. User opens the Patient Registration screen.
2. User enters basic details:

   * Name
   * Age/date of birth
   * Gender
   * Mobile number
   * Email ID
   * Address
   * Marital status
   * Profession
   * Dietary preference
   * Blood group
   * Height and weight
3. User selects consultation category:

   * Regular consultation
   * Village consultation
   * Free camp consultation
   * Other configured category
4. System checks for possible duplicates using mobile number, name, and date of birth.
5. If no duplicate is confirmed, system generates OP number.
6. System saves the patient profile.
7. System displays the generated OP number.
8. System records the action in audit trail.

### Alternate Flow

If potential duplicate records are found, the system displays matching records and asks the user to verify whether the patient already exists.

### Business Rules

1. OP number must be unique.
2. Each OP category must maintain a separate running sequence.
3. Mobile number should be captured wherever available.
4. Patient name and at least one contact or identification field should be mandatory.
5. Duplicate warning should not automatically block registration, but it should alert the user.

### Output

New patient profile created with unique OP number.

### Priority

High

---

## UC-04: Generate OP Number by Category

### Objective

Automatically generate OP numbers based on consultation category.

### Primary Actor

System

### Preconditions

Consultation category must be selected.

### Trigger

New patient registration is submitted.

### Main Flow

1. System reads the selected consultation category.
2. System identifies the configured prefix:

   * Regular consultation: OPN
   * Village consultation: OPV
   * Free camp consultation: FC
3. System retrieves the latest running sequence for that category.
4. System increments the sequence.
5. System generates the OP number.
6. System locks the sequence during generation to avoid duplicate numbers in simultaneous registration.
7. System saves the OP number against the patient profile.

### Business Rules

1. Each category must have its own independent sequence.
2. OP number should not be reused even if a record is deleted or cancelled.
3. OP number generation must be transaction-safe.
4. Prefix and number format should be configurable by Administrator.

### Output

Generated OP number such as OPN0012, OPV0012, or FC0012.

### Priority

High

---

## UC-05: Search Patient Records

### Objective

Allow users to quickly locate care seeker records using OP number, mobile number, or name.

### Primary Actor

Receptionist, Doctor, Administrator, Data Entry Staff

### Preconditions

User must be logged in and authorized to search patient records.

### Trigger

User opens Patient Search.

### Main Flow

1. User enters search criteria:

   * OP number
   * Mobile number
   * Patient name
   * Partial name
2. System searches matching records.
3. System displays matching patients with key identifiers:

   * OP number
   * Name
   * Age/gender
   * Mobile number
   * Last visit date
4. User selects the correct patient.
5. System opens the patient profile based on role permission.

### Alternate Flow

If multiple matches are found, the user can filter by mobile number, age, address, or visit date.

### Business Rules

1. Search should support partial name search.
2. Search results should show minimum required data.
3. Medical details should not be exposed in search result list unless the user opens the profile.
4. Every patient profile access must be logged.

### Output

Patient record retrieved.

### Priority

High

---

## UC-06: View Patient Profile

### Objective

Allow authorized users to view the complete or role-filtered profile of a care seeker.

### Primary Actor

Doctor, Receptionist, Administrator, Data Entry Staff

### Preconditions

Patient record must exist.

### Trigger

User selects a patient from search results.

### Main Flow

1. System opens the patient profile.
2. System displays demographic information.
3. System displays OP number and registration details.
4. System displays medical summary based on role permission.
5. System displays visit timeline.
6. System displays uploaded documents and case sheets.
7. System displays pending follow-up items.

### Business Rules

1. Doctors and Administrators can view complete clinical history.
2. Receptionists may view limited medical data based on operational need.
3. Access to every patient profile must be logged.
4. Sensitive information must be displayed only to authorized roles.

### Output

Patient profile displayed.

### Priority

High

---

## UC-07: Update Patient Profile

### Objective

Allow authorized users to update patient demographic and contact details.

### Primary Actor

Receptionist, Administrator, Data Entry Staff

### Preconditions

Patient record must exist.

### Trigger

User selects “Edit Profile.”

### Main Flow

1. User opens patient profile.
2. User selects Edit.
3. System displays editable fields based on role.
4. User updates required information.
5. System validates mandatory fields and formats.
6. System saves changes.
7. System stores old and new values in audit trail.

### Business Rules

1. OP number should not be changed after creation except by Administrator through a controlled correction process.
2. All edits must be audited.
3. Medical history should not be overwritten; it should be recorded visit-wise.
4. Mobile number changes should be tracked.

### Output

Updated patient profile.

### Priority

High

---

## UC-08: Create Patient Visit / Encounter

### Objective

Create a visit record for each consultation, review, or online interaction.

### Primary Actor

Receptionist, Doctor, Administrator

### Preconditions

Patient profile must exist.

### Trigger

Patient arrives for consultation or online consultation is initiated.

### Main Flow

1. User opens patient profile.
2. User selects “Create Visit.”
3. User selects visit type:

   * New consultation
   * Review/follow-up
   * Online consultation
   * In-person consultation
   * Camp/village consultation
4. User enters visit date and doctor.
5. System creates a visit record.
6. System adds the visit to the patient timeline.

### Business Rules

1. Every consultation must be linked to a visit.
2. A patient can have multiple visits over time.
3. Visit records must not overwrite previous visit history.
4. Visit date cannot be future-dated unless marked as scheduled.

### Output

New visit record created.

### Priority

High

---

## UC-09: Record Online Consultation Case Sheet

### Objective

Capture online consultation case sheet details in structured format.

### Primary Actor

Doctor, Authorized Staff

### Preconditions

Patient and visit record must exist.

### Trigger

Doctor or staff opens the online consultation case sheet.

### Main Flow

1. User opens patient visit.
2. User selects “Online Consultation Case Sheet.”
3. System displays case sheet form.
4. User enters or verifies:

   * Appetite
   * Sleep
   * Motion
   * Energy level
   * Hereditary diseases
   * Past ailments
   * Surgeries
   * Exercise routine
   * Normal/caesarean deliveries where applicable
   * Present complaints
   * Other observations
5. User saves the case sheet.
6. System links it to the visit and patient timeline.

### Business Rules

1. Case sheet must be linked to a patient and visit.
2. Clinical information should be editable only by doctor or authorized medical staff.
3. Changes must be versioned or audited.
4. Empty fields may be allowed if information is not applicable.

### Output

Structured online consultation case sheet saved.

### Priority

High

---

## UC-10: Record Doctor Consultation Notes

### Objective

Allow the doctor to record diagnosis, observations, treatment plan, and advice.

### Primary Actor

Doctor

### Preconditions

Patient visit must exist.

### Trigger

Doctor opens the consultation screen.

### Main Flow

1. Doctor opens patient visit.
2. Doctor reviews previous case history.
3. Doctor enters:

   * Presenting complaints
   * Diagnosis/programme
   * Clinical observations
   * Treatment advised
   * Diet advice
   * Yoga/practice advice where applicable
   * Review date
4. Doctor saves the consultation note.
5. System adds the note to the visit timeline.

### Business Rules

1. Only doctors or authorized clinical roles can enter consultation notes.
2. Consultation notes should not be deleted by normal users.
3. Corrections must be captured as amended versions or audit entries.
4. Consultation notes must be date/time stamped.

### Output

Consultation note saved.

### Priority

High

---

## UC-11: Create Prescription Record

### Objective

Record medicines and instructions prescribed to the care seeker.

### Primary Actor

Doctor

### Preconditions

Patient visit must exist.

### Trigger

Doctor selects “Create Prescription.”

### Main Flow

1. Doctor opens visit.
2. Doctor enters medication details:

   * Medicine name
   * Dosage
   * Timing
   * Duration
   * Usage instruction
   * External/internal application where applicable
3. Doctor enters review instruction.
4. Doctor saves prescription.
5. System links prescription to patient visit.
6. System allows print or PDF generation if required.

### Alternate Flow

Doctor uploads an externally prepared prescription document.

### Business Rules

1. Prescription must be linked to a patient and visit.
2. Prescription should include doctor name and date.
3. Edited prescription must maintain audit trail.
4. Prescription should be exportable as PDF in future if required.

### Output

Prescription record saved.

### Priority

High

---

## UC-12: Upload Prescription Document

### Objective

Upload scanned or image-based prescription documents to the patient record.

### Primary Actor

Doctor, Receptionist, Data Entry Staff

### Preconditions

Patient profile must exist.

### Trigger

User selects Upload Document.

### Main Flow

1. User opens patient profile or visit.
2. User selects document type as Prescription.
3. User uploads file.
4. User enters document date and optional remarks.
5. System validates file type and size.
6. System stores file securely.
7. System links file to patient profile/visit.
8. System records upload in audit trail.

### Business Rules

1. Allowed file types should include PDF, JPG, JPEG, and PNG.
2. Uploaded documents must be linked to patient profile.
3. Document uploads must be access controlled.
4. Files should be stored securely and backed up.

### Output

Prescription document uploaded and linked.

### Priority

High

---

## UC-13: Create Discharge Summary Record

### Objective

Capture discharge summary details for patients who complete treatment programmes.

### Primary Actor

Doctor, Administrator, Authorized Medical Staff

### Preconditions

Patient profile and treatment visit/programme must exist.

### Trigger

Doctor selects “Create Discharge Summary.”

### Main Flow

1. User opens patient visit or treatment programme.
2. User enters:

   * Admission date
   * Discharge date
   * Consulting doctor
   * Diagnosis/programme
   * Presenting complaints
   * Investigations at admission
   * Treatments undertaken
   * Condition at discharge
   * Follow-up period
   * Advice on discharge
   * Medications prescribed
   * Yoga/asana guidance where applicable
3. User saves discharge summary.
4. System links summary to patient timeline.
5. System allows export or print if enabled.

### Business Rules

1. Discharge summary should be created by doctor or authorized staff only.
2. Discharge date should not be earlier than admission date.
3. Summary should be immutable after finalization except through controlled amendment.
4. Finalized summaries should be available in patient history.

### Output

Discharge summary saved.

### Priority

Medium to High

---

## UC-14: Upload Discharge Summary Document

### Objective

Upload scanned or PDF discharge summaries to patient records.

### Primary Actor

Doctor, Receptionist, Data Entry Staff

### Preconditions

Patient profile must exist.

### Trigger

User selects Upload Document.

### Main Flow

1. User opens patient profile.
2. User selects document type as Discharge Summary.
3. User uploads scanned PDF/image.
4. User enters document date and remarks.
5. System validates file.
6. System stores the document.
7. System links it to patient timeline.

### Business Rules

1. Discharge summary documents must be searchable by patient.
2. Uploaded file must be protected from unauthorized access.
3. Upload activity must be audited.

### Output

Discharge summary uploaded and linked.

### Priority

Medium to High

---

## UC-15: Upload Medical Reports and Photographs

### Objective

Allow staff to upload reports, images, investigation results, and other supporting documents.

### Primary Actor

Doctor, Receptionist, Data Entry Staff

### Preconditions

Patient profile must exist.

### Trigger

User selects “Upload Medical Document.”

### Main Flow

1. User opens patient profile.
2. User selects document category:

   * Lab report
   * Photograph
   * Investigation report
   * Case sheet
   * Prescription
   * Discharge summary
   * Other
3. User uploads file.
4. User enters document date, title, and remarks.
5. System stores and links document.
6. System displays document in patient timeline.

### Business Rules

1. Document type must be selected.
2. File size and file type must be validated.
3. Files must be virus/malware scanned if infrastructure supports it.
4. Uploaded files must not be publicly accessible.

### Output

Document uploaded and linked to patient profile.

### Priority

High

---

## UC-16: Digitize Old Patient Records from 2022 Onward

### Objective

Allow old paper-based or scanned case records to be incorporated into the new system.

### Primary Actor

Data Entry Staff, Administrator

### Preconditions

Old records must be available physically or digitally.

### Trigger

Staff starts historical record entry.

### Main Flow

1. Staff searches whether patient already exists.
2. If patient exists, staff opens the profile.
3. If patient does not exist, staff creates a historical patient profile.
4. Staff enters available details from old case sheet.
5. Staff uploads scanned case sheet.
6. Staff tags the document as historical record.
7. System links the record to patient timeline.
8. System marks the entry source as “Historical / Migrated.”

### Business Rules

1. Historical records should be clearly marked.
2. If exact date is unavailable, approximate date or year may be captured with remarks.
3. Historical OP numbers should be preserved where available.
4. Data entry must be audited.

### Output

Old patient record digitized and linked.

### Priority

High

---

## UC-17: View Patient Treatment Timeline

### Objective

Provide a chronological view of all patient visits, consultations, prescriptions, discharge summaries, and uploaded documents.

### Primary Actor

Doctor, Administrator, Receptionist

### Preconditions

Patient profile must exist.

### Trigger

User opens the Timeline tab.

### Main Flow

1. System retrieves all records linked to the patient.
2. System sorts records by date.
3. System displays:

   * Registration
   * Visits
   * Case sheets
   * Consultation notes
   * Prescriptions
   * Discharge summaries
   * Uploaded reports
   * Follow-ups
4. User opens any timeline item based on permission.

### Business Rules

1. Timeline should not mix records of different patients.
2. Clinical records should be visible based on role.
3. Timeline should clearly show document type and date.
4. Historical records should be marked separately.

### Output

Complete patient treatment timeline displayed.

### Priority

High

---

## UC-18: Identify Possible Duplicate Patients

### Objective

Detect possible duplicate patient records during registration and manual review.

### Primary Actor

System, Receptionist, Administrator

### Preconditions

Patient data exists.

### Trigger

New patient registration or duplicate scan is initiated.

### Main Flow

1. System compares new or existing record against:

   * Mobile number
   * Patient name
   * Date of birth/age
   * Gender
   * Address
2. System identifies possible duplicate records.
3. System displays duplicate suggestions.
4. User reviews and confirms whether it is a duplicate.
5. If duplicate is confirmed, user requests merge or cancels new registration.

### Business Rules

1. System should suggest duplicates but should not automatically merge records.
2. Mobile number exact match should have high duplicate confidence.
3. Name similarity should be treated as possible match, not final confirmation.
4. Merge should be restricted to Administrator.

### Output

Duplicate warning or duplicate review list.

### Priority

Medium to High

---

## UC-19: Merge Duplicate Patient Records

### Objective

Allow Administrator to merge confirmed duplicate patient records safely.

### Primary Actor

Administrator

### Preconditions

Two or more records must be identified as duplicates.

### Trigger

Administrator selects “Merge Records.”

### Main Flow

1. Administrator selects primary patient record.
2. Administrator selects duplicate patient record.
3. System displays comparison:

   * OP numbers
   * Name
   * Mobile
   * Demographics
   * Visits
   * Documents
4. Administrator confirms primary record.
5. System moves visits and documents from duplicate to primary record.
6. System marks duplicate record as merged/inactive.
7. System records complete merge audit.

### Business Rules

1. Merge must be irreversible through normal UI.
2. Duplicate record should not be physically deleted.
3. Original OP numbers should be retained as aliases/search keys.
4. Merge action must require confirmation.
5. Merge must be fully audited.

### Output

Duplicate patient records merged into one longitudinal profile.

### Priority

Medium

---

## UC-20: Create Follow-Up Record

### Objective

Track patients who need review after consultation, treatment, or discharge.

### Primary Actor

Doctor, Receptionist

### Preconditions

Patient profile and visit must exist.

### Trigger

Doctor enters review instruction or staff creates follow-up task.

### Main Flow

1. User opens patient visit.
2. User selects “Add Follow-Up.”
3. User enters:

   * Follow-up date
   * Follow-up reason
   * Assigned staff/doctor
   * Remarks
4. System saves follow-up.
5. System displays follow-up in dashboard.

### Business Rules

1. Follow-up must be linked to patient.
2. Pending follow-ups should appear in dashboard.
3. Completed follow-ups should be marked as closed.
4. Follow-up updates must be audited.

### Output

Follow-up record created.

### Priority

High

---

## UC-21: Update Follow-Up Status

### Objective

Allow staff to track whether follow-up action has been completed.

### Primary Actor

Receptionist, Doctor, Administrator

### Preconditions

Follow-up record must exist.

### Trigger

User opens pending follow-up list.

### Main Flow

1. User opens pending follow-up.
2. User contacts patient or records action.
3. User updates status:

   * Pending
   * Contacted
   * Completed
   * Rescheduled
   * Not reachable
4. User enters remarks.
5. System updates dashboard.

### Business Rules

1. Follow-up status must be tracked.
2. Follow-up cannot be deleted by normal users.
3. Rescheduled follow-up should create/update the next follow-up date.
4. Status updates must be audited.

### Output

Follow-up status updated.

### Priority

High

---

## UC-22: View Basic Dashboard

### Objective

Provide staff with a quick operational view of important activities.

### Primary Actor

Administrator, Doctor, Receptionist

### Preconditions

User must be logged in.

### Trigger

User opens dashboard after login.

### Main Flow

1. System displays dashboard based on role.
2. Dashboard shows:

   * Recent registrations
   * Today’s visits
   * Pending follow-ups
   * Upcoming follow-ups
   * Recently uploaded documents
   * Patient count by OP category
3. User clicks dashboard item to view details.

### Business Rules

1. Dashboard data should be filtered based on role permission.
2. Doctors may see clinical follow-ups assigned to them.
3. Receptionists may see operational follow-ups.
4. Administrators may see overall statistics.

### Output

Role-based dashboard displayed.

### Priority

Medium to High

---

## UC-23: Export Patient Record

### Objective

Allow authorized users to export patient information and medical documents when required.

### Primary Actor

Administrator, Doctor

### Preconditions

Patient record must exist.

### Trigger

User selects “Export Patient Record.”

### Main Flow

1. User opens patient profile.
2. User selects export option.
3. User selects export scope:

   * Profile only
   * Profile with visit history
   * Specific consultation
   * Prescription
   * Discharge summary
   * Uploaded documents list
4. System generates export file.
5. System records export in audit trail.

### Business Rules

1. Export must be restricted to authorized roles.
2. Export activity must be audited.
3. Exported file should contain date and generated-by details.
4. Sensitive data export must be controlled.

### Output

Patient data exported as PDF/Excel/CSV depending on configured option.

### Priority

Medium

---

## UC-24: Generate Basic Reports

### Objective

Provide basic operational reports for administrative review.

### Primary Actor

Administrator

### Preconditions

System must contain patient and visit data.

### Trigger

Administrator opens Reports.

### Main Flow

1. Administrator selects report type:

   * Patient registration report
   * Visit report
   * Follow-up report
   * OP category report
   * Document upload report
2. Administrator selects date range.
3. System generates report.
4. Administrator views or exports report.

### Business Rules

1. Reports should respect role permissions.
2. Date range should be mandatory for large reports.
3. Export activity should be audited where patient-level data is included.

### Output

Basic report generated.

### Priority

Medium

---

## UC-25: Maintain Audit Trail

### Objective

Track important user actions for security, accountability, and operational transparency.

### Primary Actor

System, Administrator

### Preconditions

User activity occurs in the system.

### Trigger

Any auditable action is performed.

### Main Flow

1. User performs action such as create, view, update, upload, export, merge, or login.
2. System captures:

   * User
   * Role
   * Action
   * Date/time
   * Patient record affected
   * Old and new value where applicable
   * IP/device details where available
3. System stores audit log.
4. Administrator can review audit logs.

### Business Rules

1. Audit logs should not be editable by normal users.
2. Patient record access must be logged.
3. Record merge and export must always be logged.
4. Audit logs should be retained as per organizational policy.

### Output

Audit log created.

### Priority

High

---

## UC-26: Backup Patient Data and Documents

### Objective

Protect patient data and documents from accidental loss.

### Primary Actor

System, Administrator

### Preconditions

System must be configured with backup storage.

### Trigger

Scheduled backup time or administrator-initiated backup.

### Main Flow

1. System starts backup process.
2. System backs up database.
3. System backs up uploaded documents.
4. System verifies backup completion.
5. System records backup status.
6. Administrator views backup status.

### Business Rules

1. Backup should run automatically at defined frequency.
2. Backup should include both database and uploaded files.
3. Backup failure should alert Administrator.
4. Recovery process should be tested periodically.

### Output

Backup completed and logged.

### Priority

High

---

## UC-27: Restore Data from Backup

### Objective

Allow recovery of patient data in case of failure or accidental loss.

### Primary Actor

Administrator / Technical Support Team

### Preconditions

Valid backup must be available.

### Trigger

Data recovery is required.

### Main Flow

1. Administrator requests restore.
2. Technical team identifies restore point.
3. System/database backup is restored in controlled environment.
4. Data integrity is verified.
5. System is made available after validation.

### Business Rules

1. Restore should be performed only by authorized technical personnel.
2. Restore activity must be logged.
3. Restore should not be performed casually in production without approval.
4. Backup restoration should be tested during implementation.

### Output

System restored from backup.

### Priority

High

---

## UC-28: Manage Master Data

### Objective

Allow Administrator to configure reusable values used across the system.

### Primary Actor

Administrator

### Preconditions

Administrator must be logged in.

### Trigger

Administrator opens Master Data Management.

### Main Flow

1. Administrator selects master data type:

   * Consultation category
   * OP prefix
   * Doctor list
   * Document type
   * Visit type
   * Follow-up status
   * Blood group
   * Dietary preference
2. Administrator adds or updates values.
3. System validates duplicate values.
4. System saves master data.

### Business Rules

1. Master data changes must be audited.
2. OP prefix changes should not affect already generated OP numbers.
3. Inactive master data values should not appear in new records but should remain visible in old records.

### Output

Master data updated.

### Priority

Medium

---

## UC-29: Prevent Multi-User Data Conflicts

### Objective

Ensure that simultaneous access by multiple users does not corrupt or overwrite data.

### Primary Actor

System

### Preconditions

Multiple users are accessing patient data.

### Trigger

Two users attempt to update the same patient or visit record.

### Main Flow

1. User A opens patient record.
2. User B opens same patient record.
3. User A saves changes.
4. User B attempts to save changes.
5. System checks record version.
6. System warns User B that the record has changed.
7. User B reloads latest data before saving.

### Business Rules

1. OP number sequence generation must be locked transactionally.
2. Clinical records should not be silently overwritten.
3. Conflict handling should be applied for important patient and consultation records.

### Output

Data conflict prevented.

### Priority

High

---

## UC-30: Secure Document Access

### Objective

Ensure uploaded patient documents are accessed only by authorized users.

### Primary Actor

System, Authorized Users

### Preconditions

Documents must be uploaded.

### Trigger

User attempts to open or download a document.

### Main Flow

1. User opens patient document list.
2. User selects document.
3. System verifies permission.
4. System serves the document securely.
5. System logs access.

### Business Rules

1. Patient documents should not be exposed using public URLs.
2. Document access must be permission controlled.
3. Sensitive document access should be audited.
4. Deleted documents should preferably be soft-deleted or archived.

### Output

Document securely viewed or downloaded.

### Priority

High

---

# 7. Suggested Phase 1 Data Entities

## 7.1 User

Stores internal system user details.

Key fields:

* User ID
* Name
* Email/mobile
* Role
* Status
* Password hash
* Last login
* Created date

## 7.2 Role

Stores role definitions.

Key roles:

* Administrator
* Doctor
* Receptionist
* Data Entry Staff

## 7.3 Patient / Care Seeker

Stores patient profile.

Key fields:

* Patient ID
* OP number
* OP category
* Name
* Date of birth/age
* Gender
* Mobile number
* Email
* Address
* Marital status
* Profession
* Dietary preference
* Blood group
* Height
* Weight
* Registration date
* Status

## 7.4 OP Sequence

Stores category-wise OP number sequence.

Key fields:

* Category
* Prefix
* Last sequence number
* Number format
* Active status

## 7.5 Visit / Encounter

Stores each consultation or visit.

Key fields:

* Visit ID
* Patient ID
* Visit date
* Visit type
* Doctor
* Consultation category
* Status

## 7.6 Case Sheet

Stores structured case sheet information.

Key fields:

* Case Sheet ID
* Patient ID
* Visit ID
* Appetite
* Sleep
* Motion
* Energy level
* Hereditary disease
* Past ailments
* Surgeries
* Exercise routine
* Present complaints
* Remarks

## 7.7 Consultation Note

Stores doctor’s clinical notes.

Key fields:

* Consultation ID
* Patient ID
* Visit ID
* Doctor ID
* Diagnosis
* Complaints
* Observations
* Treatment advice
* Diet advice
* Review date

## 7.8 Prescription

Stores prescribed medicines and instructions.

Key fields:

* Prescription ID
* Patient ID
* Visit ID
* Doctor ID
* Prescription date
* Medicine details
* Instructions
* Review advice

## 7.9 Discharge Summary

Stores discharge information.

Key fields:

* Discharge Summary ID
* Patient ID
* Visit ID
* Admission date
* Discharge date
* Diagnosis/programme
* Treatments undertaken
* Condition at discharge
* Follow-up advice
* Medications
* Doctor

## 7.10 Document

Stores uploaded files.

Key fields:

* Document ID
* Patient ID
* Visit ID
* Document type
* File name
* File path/storage reference
* Upload date
* Uploaded by
* Remarks

## 7.11 Follow-Up

Stores follow-up tasks.

Key fields:

* Follow-up ID
* Patient ID
* Visit ID
* Follow-up date
* Assigned user
* Status
* Remarks

## 7.12 Audit Log

Stores audit trail.

Key fields:

* Audit ID
* User ID
* Action
* Entity type
* Entity ID
* Old value
* New value
* Date/time
* IP/device details

---

# 8. Non-Functional Requirements for Phase 1

## 8.1 Security

1. Secure login with password hashing.
2. Role-based access control.
3. Session timeout.
4. Access control for patient records and documents.
5. Audit logging for sensitive actions.
6. Input validation to prevent injection attacks.
7. Secure file upload validation.
8. HTTPS deployment.
9. Regular backup.
10. Restricted administrator privileges.

## 8.2 Privacy

1. Collect only necessary patient data.
2. Restrict access based on staff responsibility.
3. Log access to patient records.
4. Control patient data exports.
5. Avoid public exposure of uploaded documents.
6. Define data retention and deletion policy.

## 8.3 Performance

1. Patient search should return results quickly.
2. System should support multiple simultaneous users.
3. Large document uploads should not slow down normal usage.
4. Dashboard should load within acceptable time.

## 8.4 Availability

1. System should support daily operational usage.
2. Database and uploaded documents should be backed up.
3. Recovery procedure should be documented.
4. Deployment should include basic monitoring.

## 8.5 Usability

1. Screens should be simple for non-technical staff.
2. Search should be available from the main dashboard.
3. Patient timeline should be easy to understand.
4. Forms should resemble existing paper case sheets where possible.
5. Mandatory fields should be clearly marked.

---

# 9. Phase 1 Suggested Menu Structure

1. Dashboard
2. Patient Search
3. New Patient Registration
4. Patient Profile

   * Basic Details
   * Visits
   * Case Sheets
   * Consultation Notes
   * Prescriptions
   * Discharge Summaries
   * Documents
   * Follow-Ups
   * Audit History
5. Follow-Up Register
6. Documents Register
7. Reports
8. User Management
9. Master Data
10. Backup Status
11. Audit Logs

---

# 10. Recommended Phase 1 Implementation Priority

## Must Have

1. Login and role-based access
2. Patient registration
3. OP number generation
4. Patient search
5. Patient profile
6. Visit creation
7. Case sheet entry
8. Consultation notes
9. Prescription upload/entry
10. Discharge summary upload/entry
11. Document upload
12. Patient timeline
13. Follow-up tracking
14. Audit trail
15. Backup

## Should Have

1. Duplicate detection
2. Merge duplicate records
3. Basic dashboard
4. Basic reports
5. Export patient data
6. Master data configuration

## Could Have

1. PDF generation of prescription/discharge summary
2. Advanced search filters
3. Document preview
4. Bulk historical data import template

---

# 11. Acceptance Criteria Summary

Phase 1 shall be considered complete when:

1. Staff can securely log in based on assigned role.
2. New care seeker registration can be completed.
3. OP numbers are generated automatically by category.
4. Patients can be searched by OP number, mobile number, and name.
5. Patient profile and complete visit history can be viewed.
6. Online consultation case sheet data can be stored.
7. Doctor notes, prescriptions, and discharge summaries can be recorded or uploaded.
8. Scanned old case sheets can be uploaded and linked.
9. Follow-up records can be created and tracked.
10. Basic dashboard is available.
11. Patient reports can be exported by authorized users.
12. Duplicate records can be identified and merged by Administrator.
13. Audit trail captures create, update, view, upload, export, merge, and login actions.
14. Backup process is configured and tested.
15. Multiple users can use the system without OP number conflict or record overwrite.

---

# 12. Future Phase Recommendations

The following features are recommended after Phase 1 stabilization:

1. Website-based online registration
2. Appointment booking and slot management
3. Email/SMS/WhatsApp notifications
4. Patient portal
5. Doctor calendar
6. Public consultation request workflow
7. OCR-assisted historical record digitization
8. ABDM/ABHA readiness assessment
9. Advanced analytics dashboard
10. Mobile-friendly progressive web app
11. Teleconsultation integration
12. Patient consent management
13. Data archival and retention automation

---

# 13. Conclusion

Phase 1 should establish a strong digital foundation for ArogyaM’s patient record management. The system should prioritize secure patient registration, reliable OP number generation, fast record retrieval, structured medical history, document storage, visit timeline, follow-up tracking, auditability, and backup. This will help ArogyaM manage returning care seekers efficiently, preserve historical case records, support doctors during consultations, and reduce dependency on manual paper-based record retrieval.

# Firestore Composite Indexes Required

## Instructions
1. Go to Firebase Console → Firestore Database → Indexes
2. Create each index listed below
3. Check off when completed

## Required Indexes

### Users Collection
- [ ] tenantId (Ascending) + role (Ascending) + createdAt (Descending)
- [ ] tenantId (Ascending) + status (Ascending) + createdAt (Descending)
- [ ] tenantId (Ascending) + email (Ascending)

### Clients Collection
- [ ] tenantId (Ascending) + status (Ascending) + createdAt (Descending)
- [ ] tenantId (Ascending) + assignedTo (Ascending) + createdAt (Descending)
- [ ] tenantId (Ascending) + tier (Ascending) + createdAt (Descending)

### Leads Collection
- [ ] tenantId (Ascending) + status (Ascending) + createdAt (Descending)
- [ ] tenantId (Ascending) + assignedTo (Ascending) + createdAt (Descending)
- [ ] tenantId (Ascending) + source (Ascending) + createdAt (Descending)

### Deals Collection
- [ ] tenantId (Ascending) + stage (Ascending) + createdAt (Descending)
- [ ] tenantId (Ascending) + ownerId (Ascending) + createdAt (Descending)
- [ ] tenantId (Ascending) + status (Ascending) + value (Descending)

### Projects Collection
- [ ] tenantId (Ascending) + status (Ascending) + createdAt (Descending)
- [ ] tenantId (Ascending) + clientId (Ascending) + createdAt (Descending)
- [ ] tenantId (Ascending) + assignedTo (Ascending) + status (Ascending)

### Invoices Collection
- [ ] tenantId (Ascending) + status (Ascending) + dueDate (Ascending)
- [ ] tenantId (Ascending) + clientId (Ascending) + createdAt (Descending)
- [ ] tenantId (Ascending) + isPaid (Ascending) + dueDate (Ascending)

### Documents Collection
- [ ] tenantId (Ascending) + folderId (Ascending) + createdAt (Descending)
- [ ] tenantId (Ascending) + uploadedBy (Ascending) + createdAt (Descending)
- [ ] tenantId (Ascending) + fileType (Ascending) + createdAt (Descending)

### Notifications Collection
- [ ] tenantId (Ascending) + userId (Ascending) + createdAt (Descending)
- [ ] tenantId (Ascending) + userId (Ascending) + read (Ascending) + createdAt (Descending)

### HR Employees Collection
- [ ] tenantId (Ascending) + department (Ascending) + status (Ascending)
- [ ] tenantId (Ascending) + managerId (Ascending) + createdAt (Descending)

### Audit Logs Collection
- [ ] tenantId (Ascending) + action (Ascending) + createdAt (Descending)
- [ ] tenantId (Ascending) + userId (Ascending) + createdAt (Descending)
- [ ] tenantId (Ascending) + resourceType (Ascending) + createdAt (Descending)

## Notes
- These indexes will be auto-created when queries fail in development
- Click the error link in console to auto-create
- Or create manually in Firebase Console

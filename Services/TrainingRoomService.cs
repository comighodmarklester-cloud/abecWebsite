using System.Text.RegularExpressions;
using ABEC_System.Data;
using ABEC_System.DTOs;
using ABEC_System.Interfaces;
using ABEC_System.Models;
using Microsoft.EntityFrameworkCore;

namespace ABEC_System.Services;

public class TrainingRoomService : ITrainingRoomService
{
    private readonly ApplicationDbContext _db;

    public TrainingRoomService(ApplicationDbContext db) => _db = db;

    public async Task<ApiResponse<IReadOnlyList<TrainingRoomDto>>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        var rooms = await _db.TrainingRooms.AsNoTracking()
            .Include(room => room.Course)
            .OrderBy(room => room.RoomName)
            .ToListAsync(cancellationToken);
        return ApiResponse<IReadOnlyList<TrainingRoomDto>>.Ok(rooms.Select(Map).ToList());
    }

    public async Task<ApiResponse<TrainingRoomDto>> CreateAsync(CreateTrainingRoomDto dto, CancellationToken cancellationToken = default)
    {
        var name = Collapse(dto.RoomName);
        if (string.IsNullOrWhiteSpace(name))
            return ApiResponse<TrainingRoomDto>.Fail("Room name is required.");
        if (name.Length > 100)
            return ApiResponse<TrainingRoomDto>.Fail("Room names must be 100 characters or fewer.");

        var description = Collapse(dto.Description);
        if (description.Length > 255)
            return ApiResponse<TrainingRoomDto>.Fail("Room descriptions must be 255 characters or fewer.");

        var course = await _db.Courses.AsNoTracking()
            .FirstOrDefaultAsync(item => item.CourseId == dto.CourseId, cancellationToken);
        if (course is null)
            return ApiResponse<TrainingRoomDto>.Fail("Select a course before adding a training room.");

        var existing = await FindByNameAsync(name, cancellationToken);
        if (existing is not null)
        {
            await _db.Entry(existing).Reference(room => room.Course).LoadAsync(cancellationToken);
            return ApiResponse<TrainingRoomDto>.Ok(Map(existing), "This room is already registered.");
        }

        var entity = new TrainingRoom
        {
            RoomName = name,
            Description = string.IsNullOrWhiteSpace(description) ? null : description,
            CourseId = course.CourseId
        };
        _db.TrainingRooms.Add(entity);
        await _db.SaveChangesAsync(cancellationToken);
        entity.Course = course;
        return ApiResponse<TrainingRoomDto>.Ok(Map(entity), "Training room saved.");
    }

    private async Task<TrainingRoom?> FindByNameAsync(string name, CancellationToken cancellationToken)
    {
        var rooms = await _db.TrainingRooms.ToListAsync(cancellationToken);
        return rooms.FirstOrDefault(room => string.Equals(room.RoomName.Trim(), name, StringComparison.OrdinalIgnoreCase));
    }

    private static string Collapse(string? value)
        => Regex.Replace((value ?? string.Empty).Trim(), @"\s+", " ");

    private static TrainingRoomDto Map(TrainingRoom room) => new()
    {
        RoomId = room.RoomId,
        RoomName = room.RoomName,
        Description = room.Description,
        CourseId = room.CourseId,
        CourseName = room.Course?.CourseName ?? string.Empty
    };
}

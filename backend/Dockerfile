FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY Meets.Api/Meets.Api.csproj Meets.Api/
RUN dotnet restore Meets.Api/Meets.Api.csproj

COPY . .
RUN dotnet publish Meets.Api/Meets.Api.csproj -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .

EXPOSE 5000
ENV ASPNETCORE_URLS=http://+:5000

ENTRYPOINT ["dotnet", "Meets.Api.dll"]
